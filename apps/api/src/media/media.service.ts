import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { promises as fsp } from "fs";
import { basename, extname } from "path";
import { randomUUID } from "crypto";

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts?: { search?: string; type?: string; folderId?: string }) {
    const q = (opts?.search || "").trim();
    const t = (opts?.type || "").trim().toLowerCase();
    const folderIdRaw = opts?.folderId != null ? String(opts.folderId) : undefined;

    const and: any[] = [];

    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { type: { contains: q, mode: "insensitive" } },
          { url: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    if (t && (t === "image" || t === "video")) {
      and.push({ type: t });
    }

    if (folderIdRaw) {
      if (folderIdRaw === "root") and.push({ folderId: null });
      else and.push({ folderId: folderIdRaw });
    }

    return this.prisma.media.findMany({
      where: and.length ? { AND: and } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * meta rows are matched by (originalname + size)
   */
  async createManyFromUploads(
    files: Express.Multer.File[],
    folderId?: string | null,
    meta?: Array<{ name: string; size: number; durationMs?: number }>
  ) {
    const created: any[] = [];

    const metaMap = new Map<string, number>();
    for (const m of meta || []) {
      const k = `${String(m?.name || "")}|${Number(m?.size || 0)}`;
      const d = Number(m?.durationMs);
      if (k && Number.isFinite(d) && d > 0) metaMap.set(k, Math.round(d));
    }

    for (const f of files) {
      const mime = (f.mimetype || "").toLowerCase();
      const type = mime.startsWith("video/") ? "video" : "image";

      // Ensure a persisted filename exists.
      const persisted = await this.ensurePersistedFile(f);

      const url = `/media/${persisted.filename}`;

      const key = `${String(f.originalname || "")}|${Number((f as any).size || 0)}`;
      const durationMs = type === "video" ? (metaMap.get(key) ?? null) : null;

      const row = await this.prisma.media.create({
        data: {
          url,
          type,
          name: f.originalname ?? persisted.filename ?? null,
          mimeType: f.mimetype || null,
          sizeBytes: typeof (f as any).size === "number" ? (f as any).size : null,
          folderId: folderId || null,
          durationMs,
        },
      });

      created.push(row);
    }

    return created;
  }

  async move(mediaId: string, folderId: string | null) {
    const m = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!m) throw new BadRequestException("Media not found");

    const nextFolderId = folderId ? String(folderId) : null;

    if (nextFolderId) {
      const f = await this.prisma.mediaFolder.findUnique({ where: { id: nextFolderId } });
      if (!f) throw new BadRequestException("Target folder not found");
    }

    const updated = await this.prisma.media.update({
      where: { id: mediaId },
      data: { folderId: nextFolderId },
    });

    return { ok: true, item: updated };
  }

  async usage(mediaId: string) {
    const rows = await this.prisma.playlistItem.findMany({
      where: { mediaId },
      select: { playlist: { select: { id: true, name: true } } },
    });

    const map = new Map<string, { id: string; name: string }>();
    for (const r of rows) {
      if (r.playlist) map.set(r.playlist.id, r.playlist);
    }

    return { mediaId, playlists: Array.from(map.values()) };
  }

  async usageBulk(ids: string[]) {
    const uniq = Array.from(new Set(ids.map(String)));

    const rows = await this.prisma.playlistItem.findMany({
      where: { mediaId: { in: uniq } },
      select: {
        mediaId: true,
        playlist: { select: { id: true, name: true } },
      },
    });

    const byMedia = new Map<string, Map<string, { id: string; name: string }>>();
    for (const r of rows) {
      const mid = String(r.mediaId);
      if (!byMedia.has(mid)) byMedia.set(mid, new Map());
      if (r.playlist) byMedia.get(mid)!.set(r.playlist.id, r.playlist);
    }

    const items = uniq.map((mid) => ({
      mediaId: mid,
      playlists: Array.from(byMedia.get(mid)?.values() || []),
    }));

    return { items };
  }

  async remove(id: string) {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) throw new BadRequestException("Media not found");

    await this.prisma.media.delete({ where: { id } });
    await this.tryDeleteDiskFile(media.url);

    return { ok: true };
  }

  async bulkDelete(ids: string[]) {
    const uniq = Array.from(new Set(ids.map(String)));
    if (uniq.length === 0) throw new BadRequestException("Missing ids[]");

    const medias = await this.prisma.media.findMany({
      where: { id: { in: uniq } },
      select: { id: true, url: true },
    });

    await this.prisma.media.deleteMany({ where: { id: { in: uniq } } });
    await Promise.allSettled(medias.map((m) => this.tryDeleteDiskFile(m.url)));

    return { ok: true, count: uniq.length };
  }

  /**
   * If multer used diskStorage, file.filename exists and file is already persisted.
   * If memoryStorage, file.buffer exists but filename does not. We persist it.
   */
  private async ensurePersistedFile(file: Express.Multer.File): Promise<{ filename: string }> {
    const existing = (file as any).filename;
    if (existing && typeof existing === "string" && existing.trim()) {
      return { filename: existing.trim() };
    }

    const buf = (file as any).buffer as Buffer | undefined;
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
      throw new BadRequestException("Upload storage did not provide filename or buffer");
    }

    const original = String(file.originalname || "upload.bin");
    const ext = extname(original).slice(0, 12) || "";
    const filename = `${Date.now()}-${randomUUID()}${ext}`;

    await fsp.mkdir("/opt/novasign/storage/media", { recursive: true });
    await fsp.writeFile(`/opt/novasign/storage/media/${filename}`, buf);

    return { filename };
  }

  private async tryDeleteDiskFile(url: string) {
    try {
      const u = String(url || "");
      if (!u.startsWith("/media/")) return;

      const file = basename(u);
      if (!file || file.includes("..") || file.includes("/")) return;

      await fsp.unlink(`/opt/novasign/storage/media/${file}`);
    } catch {
      // ignore
    }
  }
}

