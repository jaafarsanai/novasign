import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { randomUUID, createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { createReadStream, promises as fsp } from "fs";

function guessType(mime: string): "image" | "video" {
  if ((mime || "").toLowerCase().startsWith("video/")) return "video";
  return "image";
}

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const rs = createReadStream(filePath);
    rs.on("error", reject);
    rs.on("data", (chunk) => hash.update(chunk));
    rs.on("end", () => resolve(hash.digest("hex")));
  });
}

@Controller("playlists")
export class PlaylistUploadController {
  constructor(private readonly prisma: PrismaService) {}

  @Post(":id/items/upload")
  @UseInterceptors(
    FilesInterceptor("files", 50, {
      storage: diskStorage({
        destination: "/opt/novasign/storage/media",
        filename: (_req, file, cb) => {
          const safeExt = extname(file.originalname || "").toLowerCase() || "";
          cb(null, `${randomUUID()}${safeExt}`);
        },
      }),
      limits: { fileSize: 500 * 1024 * 1024 },
    })
  )
  async uploadToPlaylist(
    @Param("id") playlistId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { durationMs?: string; order?: string }
  ) {
    if (!playlistId) throw new BadRequestException("Missing playlist id");
    if (!files || files.length === 0) {
      throw new BadRequestException("Missing files (multipart field name must be 'files')");
    }

    const pl = await this.prisma.playlist.findUnique({ where: { id: playlistId } });
    if (!pl) throw new BadRequestException("Playlist not found");

    const maxOrderRow = await this.prisma.playlistItem.findFirst({
      where: { playlistId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    let orderCursor = body?.order != null ? Number(body.order) : (maxOrderRow?.order ?? 0) + 1;

    const createdItems: any[] = [];

    for (const file of files) {
      const type = guessType(file.mimetype);
      const publicUrl = `/media/${file.filename}`;
      const filePath = (file as any).path as string | undefined;

      // duration for images: default 5000ms unless body.durationMs
      const durationMs =
        body?.durationMs != null && body.durationMs !== ""
          ? Number(body.durationMs)
          : type === "image"
            ? 5000
            : null;

      let mediaRow = null as any;

      // checksum dedupe (only works when diskStorage provides a path)
      if (filePath) {
        const checksum = await sha256File(filePath);

        const existing = await this.prisma.media.findUnique({ where: { checksum } });
        if (existing) {
          // remove duplicate disk file
          try {
            await fsp.unlink(filePath);
          } catch {}
          mediaRow = existing;
        } else {
          mediaRow = await this.prisma.media.create({
            data: {
              type,
              url: publicUrl,
              name: file.originalname || null,
              mimeType: file.mimetype || null,
              sizeBytes: typeof file.size === "number" ? file.size : null,
              checksum,
            },
          });
        }
      } else {
        // fallback: no checksum possible
        mediaRow = await this.prisma.media.create({
          data: {
            type,
            url: publicUrl,
            name: file.originalname || null,
            mimeType: file.mimetype || null,
            sizeBytes: typeof file.size === "number" ? file.size : null,
          },
        });
      }

      const item = await this.prisma.playlistItem.create({
        data: {
          playlistId,
          mediaId: mediaRow.id,
          order: orderCursor++,
          duration: durationMs,
        },
        include: { media: true },
      });

      createdItems.push(item);
    }

    return { ok: true, count: createdItems.length, items: createdItems };
  }
}

