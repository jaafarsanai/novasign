import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  ForbiddenException,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { randomUUID, createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { createReadStream, promises as fsp } from "fs";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentAuth } from "../auth/current-auth.decorator";
import type { AuthContext } from "../auth/interfaces/auth-context.interface";
import { isOrgAdmin } from "../auth/role-helpers";

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
@UseGuards(JwtAuthGuard)
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
    }),
  )
  async uploadToPlaylist(
    @CurrentAuth() auth: AuthContext,
    @Param("id") playlistId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { durationMs?: string; order?: string },
  ) {
    if (!playlistId) throw new BadRequestException("Missing playlist id");
    if (!files || files.length === 0) {
      throw new BadRequestException("Missing files (multipart field name must be 'files')");
    }

    const pl = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      select: {
        id: true,
        organizationId: true,
        workspaceId: true,
        isArchived: true,
      },
    });

    if (!pl || pl.organizationId !== auth.organizationId || pl.isArchived) {
      throw new BadRequestException("Playlist not found");
    }

    if (!isOrgAdmin(auth) && pl.workspaceId !== auth.activeWorkspaceId) {
      throw new ForbiddenException("Playlist is outside active workspace");
    }

    const maxOrderRow = await this.prisma.playlistItem.findFirst({
      where: { playlistId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    let orderCursor =
      body?.order != null ? Number(body.order) : (maxOrderRow?.order ?? 0) + 1;

    const createdItems: any[] = [];

    for (const file of files) {
      const type = guessType(file.mimetype);
      const publicUrl = `/api/media/${file.filename}`;
      const filePath = (file as any).path as string | undefined;

      const durationMs =
        body?.durationMs != null && body.durationMs !== ""
          ? Number(body.durationMs)
          : type === "image"
            ? 5000
            : null;

      let mediaRow: any = null;

      if (filePath) {
        const checksum = await sha256File(filePath);

        const existing = await this.prisma.media.findUnique({
          where: { checksum },
        });

        if (
          existing &&
          existing.organizationId === pl.organizationId &&
          (
            existing.visibilityScope === "GLOBAL" ||
            existing.workspaceId === pl.workspaceId
          )
        ) {
          try {
            await fsp.unlink(filePath);
          } catch {}
          mediaRow = existing;
        } else {
          mediaRow = await this.prisma.media.create({
            data: {
              organizationId: pl.organizationId,
              workspaceId: pl.workspaceId,
              visibilityScope: pl.workspaceId ? "WORKSPACE" : "GLOBAL",
              ownerType: pl.workspaceId ? "WORKSPACE" : "ORGANIZATION",
              createdByUserId: auth.userId,
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
        mediaRow = await this.prisma.media.create({
          data: {
            organizationId: pl.organizationId,
            workspaceId: pl.workspaceId,
            visibilityScope: pl.workspaceId ? "WORKSPACE" : "GLOBAL",
            ownerType: pl.workspaceId ? "WORKSPACE" : "ORGANIZATION",
            createdByUserId: auth.userId,
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