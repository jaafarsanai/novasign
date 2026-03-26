import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { promises as fsp } from "fs";
import { basename, extname } from "path";
import { randomUUID } from "crypto";
import { AuthContext } from "../auth/interfaces/auth-context.interface";
import { isOrgAdmin } from "../auth/role-helpers";

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  private requireActiveWorkspaceId(auth: AuthContext): string {
    if (!auth.activeWorkspaceId) {
      throw new BadRequestException("No active workspace selected");
    }
    return auth.activeWorkspaceId;
  }

  private buildVisibleMediaWhere(auth: AuthContext, extraWhere?: any) {
    const workspaceId = this.requireActiveWorkspaceId(auth);

    return {
      organizationId: auth.organizationId,
      AND: [
        {
          OR: [
            { visibilityScope: "GLOBAL" },
            {
              visibilityScope: "WORKSPACE",
              workspaceId,
            },
          ],
        },
        ...(extraWhere ? [extraWhere] : []),
      ],
    };
  }

  private async getScopedMediaOrThrow(auth: AuthContext, mediaId: string) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: {
        id: true,
        organizationId: true,
        workspaceId: true,
        visibilityScope: true,
        ownerType: true,
        folderId: true,
        url: true,
        name: true,
      },
    });

    if (!media || media.organizationId !== auth.organizationId) {
      throw new NotFoundException("Media not found");
    }

    if (
      !isOrgAdmin(auth) &&
      !(
        media.visibilityScope === "GLOBAL" ||
        (media.visibilityScope === "WORKSPACE" && media.workspaceId === auth.activeWorkspaceId)
      )
    ) {
      throw new ForbiddenException("Media is not accessible in active workspace");
    }

    return media;
  }

  private async assertCanDeleteMedia(auth: AuthContext, mediaId: string) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: {
        id: true,
        organizationId: true,
        workspaceId: true,
        visibilityScope: true,
        ownerType: true,
        url: true,
      },
    });

    if (!media || media.organizationId !== auth.organizationId) {
      throw new NotFoundException("Media not found");
    }

    if (isOrgAdmin(auth)) {
      return media;
    }

    if (media.ownerType !== "WORKSPACE" || media.workspaceId !== auth.activeWorkspaceId) {
      throw new ForbiddenException(
        "You cannot delete media owned by another workspace or the organization",
      );
    }

    return media;
  }

  private async assertFolderAccessible(
    auth: AuthContext,
    folderId: string,
  ): Promise<{
    id: string;
    organizationId: string;
    workspaceId: string | null;
    visibilityScope: "GLOBAL" | "WORKSPACE";
    ownerType: "ORGANIZATION" | "WORKSPACE";
  }> {
    const folder = await this.prisma.mediaFolder.findUnique({
      where: { id: folderId },
      select: {
        id: true,
        organizationId: true,
        workspaceId: true,
        visibilityScope: true,
        ownerType: true,
      },
    });

    if (!folder || folder.organizationId !== auth.organizationId) {
      throw new BadRequestException("Folder not found");
    }

    if (
      !isOrgAdmin(auth) &&
      !(
        folder.visibilityScope === "GLOBAL" ||
        (folder.visibilityScope === "WORKSPACE" && folder.workspaceId === auth.activeWorkspaceId)
      )
    ) {
      throw new ForbiddenException("Folder is not accessible in active workspace");
    }

    return folder as any;
  }

  async list(
    auth: AuthContext,
    opts?: {
      search?: string;
      type?: string;
      folderId?: string;
      includeFolders?: boolean;
    },
  ) {
    const q = (opts?.search || "").trim();
    const t = (opts?.type || "").trim().toLowerCase();
    const folderIdRaw = opts?.folderId != null ? String(opts.folderId) : undefined;
    const includeFolders = !!opts?.includeFolders;

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
      if (folderIdRaw === "root") {
        and.push({ folderId: null });
      } else {
        await this.assertFolderAccessible(auth, folderIdRaw);
        and.push({ folderId: folderIdRaw });
      }
    }

    const items = await this.prisma.media.findMany({
      where: this.buildVisibleMediaWhere(auth, and.length ? { AND: and } : undefined),
      orderBy: { createdAt: "desc" },
    });

    let folders: Array<{ id: string; name: string; parentId: string | null }> = [];

    if (includeFolders) {
      const parentId =
        folderIdRaw == null ? null : folderIdRaw === "root" ? null : folderIdRaw;

      const folderAnd: any[] = [];

      if (parentId === null) {
        folderAnd.push({ parentId: null });
      } else {
        folderAnd.push({ parentId });
      }

      if (q) {
        folderAnd.push({ name: { contains: q, mode: "insensitive" } });
      }

      const folderWhere = {
        organizationId: auth.organizationId,
        AND: [
          {
            OR: [
              { visibilityScope: "GLOBAL" },
              {
                visibilityScope: "WORKSPACE",
                workspaceId: this.requireActiveWorkspaceId(auth),
              },
            ],
          },
          ...folderAnd,
        ],
      };

      const f = await this.prisma.mediaFolder.findMany({
        where: folderWhere,
        orderBy: { name: "asc" },
        select: { id: true, name: true, parentId: true },
      });

      folders = f.map((x) => ({
        id: String(x.id),
        name: String(x.name),
        parentId: x.parentId ? String(x.parentId) : null,
      }));
    }

    return { items, folders };
  }

  async listFolders(auth: AuthContext, opts?: { parentId?: string }) {
    const parentIdRaw = String(opts?.parentId ?? "root");

    const and: any[] = [];

    if (parentIdRaw === "root") {
      and.push({ parentId: null });
    } else {
      await this.assertFolderAccessible(auth, parentIdRaw);
      and.push({ parentId: parentIdRaw });
    }

    return this.prisma.mediaFolder.findMany({
      where: {
        organizationId: auth.organizationId,
        AND: [
          {
            OR: [
              { visibilityScope: "GLOBAL" },
              {
                visibilityScope: "WORKSPACE",
                workspaceId: this.requireActiveWorkspaceId(auth),
              },
            ],
          },
          ...and,
        ],
      },
      select: { id: true, name: true, parentId: true },
      orderBy: { name: "asc" },
    });
  }

  async createManyFromUploads(
    auth: AuthContext,
    files: Express.Multer.File[],
    folderId?: string | null,
    meta?: Array<{ name: string; size: number; durationMs?: number }>,
  ) {
    const workspaceId = this.requireActiveWorkspaceId(auth);
    const created: any[] = [];

    let targetFolder:
      | {
          id: string;
          organizationId: string;
          workspaceId: string | null;
          visibilityScope: "GLOBAL" | "WORKSPACE";
          ownerType: "ORGANIZATION" | "WORKSPACE";
        }
      | undefined;

    if (folderId) {
      targetFolder = await this.assertFolderAccessible(auth, String(folderId));

      if (!isOrgAdmin(auth)) {
        if (
          targetFolder.visibilityScope !== "WORKSPACE" ||
          targetFolder.workspaceId !== auth.activeWorkspaceId
        ) {
          throw new ForbiddenException(
            "Workspace users can only upload into folders owned by their active workspace",
          );
        }
      }
    }

    const metaMap = new Map<string, number>();
    for (const m of meta || []) {
      const k = `${String(m?.name || "")}|${Number(m?.size || 0)}`;
      const d = Number(m?.durationMs);
      if (k && Number.isFinite(d) && d > 0) metaMap.set(k, Math.round(d));
    }

    for (const f of files) {
      const mime = (f.mimetype || "").toLowerCase();
      const type = mime.startsWith("video/") ? "video" : "image";

      const persisted = await this.ensurePersistedFile(f);
      const url = `/api/media/${persisted.filename}`;

      const key = `${String(f.originalname || "")}|${Number((f as any).size || 0)}`;
      const durationMs = type === "video" ? metaMap.get(key) ?? null : null;

      const row = await this.prisma.media.create({
        data: {
          organizationId: auth.organizationId,
          workspaceId:
            targetFolder?.visibilityScope === "GLOBAL" ? null : workspaceId,
          visibilityScope:
            targetFolder?.visibilityScope ?? "WORKSPACE",
          ownerType:
            targetFolder?.ownerType ?? "WORKSPACE",
          createdByUserId: auth.userId,
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

  async move(auth: AuthContext, mediaId: string, folderId: string | null) {
    const media = await this.getScopedMediaOrThrow(auth, mediaId);

    let nextFolderId = folderId ? String(folderId) : null;
    let targetFolder:
      | {
          id: string;
          organizationId: string;
          workspaceId: string | null;
          visibilityScope: "GLOBAL" | "WORKSPACE";
          ownerType: "ORGANIZATION" | "WORKSPACE";
        }
      | null = null;

    if (nextFolderId) {
      targetFolder = await this.assertFolderAccessible(auth, nextFolderId);
    }

    if (!isOrgAdmin(auth)) {
      if (media.ownerType !== "WORKSPACE" || media.workspaceId !== auth.activeWorkspaceId) {
        throw new ForbiddenException(
          "You can only move media owned by your active workspace",
        );
      }

      if (
        targetFolder &&
        (targetFolder.visibilityScope !== "WORKSPACE" ||
          targetFolder.workspaceId !== auth.activeWorkspaceId)
      ) {
        throw new ForbiddenException(
          "You can only move media into folders owned by your active workspace",
        );
      }
    }

    const updated = await this.prisma.media.update({
      where: { id: mediaId },
      data: { folderId: nextFolderId },
    });

    return { ok: true, item: updated };
  }

  async usage(auth: AuthContext, mediaId: string) {
    await this.getScopedMediaOrThrow(auth, mediaId);

    const rows = await this.prisma.playlistItem.findMany({
      where: {
        mediaId,
        playlist: {
          organizationId: auth.organizationId,
        },
      },
      select: {
        playlist: {
          select: { id: true, name: true, workspaceId: true, organizationId: true },
        },
      },
    });

    const map = new Map<string, { id: string; name: string }>();
    for (const r of rows) {
      if (!r.playlist) continue;

      if (!isOrgAdmin(auth) && r.playlist.workspaceId !== auth.activeWorkspaceId) {
        continue;
      }

      map.set(r.playlist.id, { id: r.playlist.id, name: r.playlist.name });
    }

    return { mediaId, playlists: Array.from(map.values()) };
  }

  async usageBulk(auth: AuthContext, ids: string[]) {
    const uniq = Array.from(new Set(ids.map(String)));

    const mediaRows = await this.prisma.media.findMany({
      where: this.buildVisibleMediaWhere(auth, { id: { in: uniq } }),
      select: { id: true },
    });

    const allowedIds = mediaRows.map((m) => String(m.id));

    const rows = await this.prisma.playlistItem.findMany({
      where: {
        mediaId: { in: allowedIds },
        playlist: {
          organizationId: auth.organizationId,
        },
      },
      select: {
        mediaId: true,
        playlist: {
          select: { id: true, name: true, workspaceId: true },
        },
      },
    });

    const byMedia = new Map<string, Map<string, { id: string; name: string }>>();
    for (const r of rows) {
      const mid = String(r.mediaId);
      if (!byMedia.has(mid)) byMedia.set(mid, new Map());

      if (!r.playlist) continue;
      if (!isOrgAdmin(auth) && r.playlist.workspaceId !== auth.activeWorkspaceId) continue;

      byMedia.get(mid)!.set(r.playlist.id, {
        id: r.playlist.id,
        name: r.playlist.name,
      });
    }

    const items = allowedIds.map((mid) => ({
      mediaId: mid,
      playlists: Array.from(byMedia.get(mid)?.values() || []),
    }));

    return { items };
  }

  async remove(auth: AuthContext, id: string) {
    const media = await this.assertCanDeleteMedia(auth, id);

    await this.prisma.media.delete({ where: { id } });
    await this.tryDeleteDiskFile(media.url);

    return { ok: true };
  }

  async bulkDelete(auth: AuthContext, ids: string[]) {
    const uniq = Array.from(new Set(ids.map(String)));
    if (uniq.length === 0) throw new BadRequestException("Missing ids[]");

    const medias = await this.prisma.media.findMany({
      where: {
        id: { in: uniq },
        organizationId: auth.organizationId,
      },
      select: {
        id: true,
        url: true,
        ownerType: true,
        workspaceId: true,
      },
    });

    if (!isOrgAdmin(auth)) {
      const blocked = medias.find(
        (m) => m.ownerType !== "WORKSPACE" || m.workspaceId !== auth.activeWorkspaceId,
      );
      if (blocked) {
        throw new ForbiddenException(
          "You cannot delete media owned by another workspace or the organization",
        );
      }
    }

    const allowedIds = medias.map((m) => m.id);

    await this.prisma.media.deleteMany({
      where: { id: { in: allowedIds } },
    });

    await Promise.allSettled(medias.map((m) => this.tryDeleteDiskFile(m.url)));

    return { ok: true, count: allowedIds.length };
  }

  async getById(auth: AuthContext, id: string) {
    await this.getScopedMediaOrThrow(auth, String(id));
    return this.prisma.media.findUnique({ where: { id: String(id) } });
  }

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

    await fsp.mkdir("/opt/pulsepanels/storage/media", { recursive: true });
    await fsp.writeFile(`/opt/pulsepanels/storage/media/${filename}`, buf);

    return { filename };
  }

  private async tryDeleteDiskFile(url: string) {
    try {
      const u = String(url || "");
      if (!u.startsWith("/api/media/")) return;

      const file = basename(u);
      if (!file || file.includes("..") || file.includes("/")) return;

      await fsp.unlink(`/opt/pulsepanels/storage/media/${file}`);
    } catch {
      // ignore
    }
  }
}