import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthContext } from "../auth/interfaces/auth-context.interface";
import { isOrgAdmin } from "../auth/role-helpers";

type AccessibleMedia = {
  id: string;
  organizationId: string | null;
  workspaceId: string | null;
  visibilityScope: any;
  type: string;
  durationMs: number | null;
};

@Injectable()
export class PlaylistsService {
  constructor(private readonly prisma: PrismaService) {}

  private requireActiveWorkspaceId(auth: AuthContext): string {
    if (!auth.activeWorkspaceId) {
      throw new BadRequestException("No active workspace selected");
    }
    return auth.activeWorkspaceId;
  }

  private async getScopedPlaylistOrThrow(auth: AuthContext, playlistId: string) {
    const playlist = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      select: {
        id: true,
        organizationId: true,
        workspaceId: true,
        isArchived: true,
        name: true,
      },
    });

    if (!playlist || playlist.organizationId !== auth.organizationId || playlist.isArchived) {
      throw new NotFoundException("Playlist not found");
    }

    if (!isOrgAdmin(auth) && playlist.workspaceId !== auth.activeWorkspaceId) {
      throw new ForbiddenException("Playlist is outside active workspace");
    }

    return playlist;
  }

  private async assertMediaAccessible(
    auth: AuthContext,
    mediaId: string,
  ): Promise<AccessibleMedia> {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: {
        id: true,
        organizationId: true,
        workspaceId: true,
        visibilityScope: true,
        type: true,
        durationMs: true,
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

  async list(auth: AuthContext) {
    const where = isOrgAdmin(auth)
      ? {
          organizationId: auth.organizationId,
          isArchived: false,
        }
      : {
          organizationId: auth.organizationId,
          workspaceId: this.requireActiveWorkspaceId(auth),
          isArchived: false,
        };

    return this.prisma.playlist.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        workspaceId: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async create(auth: AuthContext, name: string) {
    return this.prisma.playlist.create({
      data: {
        name,
        organizationId: auth.organizationId,
        workspaceId: this.requireActiveWorkspaceId(auth),
        createdByUserId: auth.userId,
        isArchived: false,
      },
      select: {
        id: true,
        name: true,
        workspaceId: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async get(auth: AuthContext, id: string) {
    await this.getScopedPlaylistOrThrow(auth, id);

    const p = await this.prisma.playlist.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { order: "asc" },
          include: { media: true },
        },
      },
    });

    if (!p) throw new NotFoundException("Playlist not found");
    return p;
  }

  async duplicateById(auth: AuthContext, id: string) {
    const src = await this.getScopedPlaylistOrThrow(auth, id);

    return this.prisma.$transaction(async (tx) => {
      const playlist = await tx.playlist.findUnique({
        where: { id: src.id },
        include: { items: true },
      });

      if (!playlist) throw new NotFoundException("Playlist not found");

      const created = await tx.playlist.create({
        data: {
          name: `${playlist.name} (copy)`,
          organizationId: auth.organizationId,
          workspaceId: this.requireActiveWorkspaceId(auth),
          createdByUserId: auth.userId,
          isArchived: false,
        },
      });

      if (playlist.items?.length) {
        await tx.playlistItem.createMany({
          data: playlist.items.map((it: any) => ({
            playlistId: created.id,
            mediaId: it.mediaId,
            order: it.order ?? 0,
            duration: it.duration ?? null,
          })),
        });
      }

      return created;
    });
  }

  async listItems(auth: AuthContext, playlistId: string) {
    await this.getScopedPlaylistOrThrow(auth, playlistId);

    return this.prisma.playlistItem.findMany({
      where: { playlistId },
      orderBy: { order: "asc" },
      include: { media: true },
    });
  }

  async rename(auth: AuthContext, id: string, name: string) {
    await this.getScopedPlaylistOrThrow(auth, id);

    return this.prisma.playlist.update({
      where: { id },
      data: { name },
      select: {
        id: true,
        name: true,
        workspaceId: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async reorderItems(auth: AuthContext, playlistId: string, itemIds: string[]) {
    await this.getScopedPlaylistOrThrow(auth, playlistId);

    const existingItems = await this.prisma.playlistItem.findMany({
      where: { playlistId },
      select: { id: true },
    });

    const existingItemIds = new Set(existingItems.map((x) => x.id));
    for (const itemId of itemIds) {
      if (!existingItemIds.has(itemId)) {
        throw new BadRequestException(`Playlist item ${itemId} does not belong to this playlist`);
      }
    }

    const ops = itemIds.map((itemId, idx) =>
      this.prisma.playlistItem.updateMany({
        where: { id: itemId, playlistId },
        data: { order: idx + 1 },
      }),
    );

    await this.prisma.$transaction(ops);
    return { ok: true };
  }

  async updateItemDuration(
    auth: AuthContext,
    playlistId: string,
    itemId: string,
    durationMs: number,
  ) {
    await this.getScopedPlaylistOrThrow(auth, playlistId);

    const res = await this.prisma.playlistItem.updateMany({
      where: { id: itemId, playlistId },
      data: { duration: durationMs },
    });

    if (res.count === 0) {
      throw new NotFoundException("Playlist item not found for this playlist");
    }

    return { ok: true };
  }

  async addExistingMediaToPlaylist(
    auth: AuthContext,
    playlistId: string,
    mediaIds: string[],
    durationMs?: number,
  ) {
    await this.getScopedPlaylistOrThrow(auth, playlistId);

    const uniqueIds = Array.from(new Set(mediaIds.map(String)));
    if (!uniqueIds.length) {
      throw new BadRequestException("No media ids provided");
    }

    const accessibleMedia: AccessibleMedia[] = [];
    for (const mediaId of uniqueIds) {
      accessibleMedia.push(await this.assertMediaAccessible(auth, mediaId));
    }

    const maxOrderRow = await this.prisma.playlistItem.findFirst({
      where: { playlistId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    let orderCursor = (maxOrderRow?.order ?? 0) + 1;
    const created: any[] = [];

    for (const m of accessibleMedia) {
      const defaultDuration =
        m.type === "image"
          ? 5000
          : typeof m.durationMs === "number"
            ? m.durationMs
            : null;

      const item = await this.prisma.playlistItem.create({
        data: {
          playlistId,
          mediaId: m.id,
          order: orderCursor++,
          duration: typeof durationMs === "number" ? durationMs : defaultDuration,
        },
        include: { media: true },
      });

      created.push(item);
    }

    return { ok: true, count: created.length, items: created };
  }

  async deleteItem(auth: AuthContext, playlistId: string, itemId: string) {
    await this.getScopedPlaylistOrThrow(auth, playlistId);

    const item = await this.prisma.playlistItem.findFirst({
      where: { id: itemId, playlistId },
      select: { id: true },
    });

    if (!item) throw new NotFoundException("Playlist item not found");

    await this.prisma.playlistItem.delete({ where: { id: item.id } });
    return { ok: true };
  }

  async remove(auth: AuthContext, id: string) {
    await this.getScopedPlaylistOrThrow(auth, id);

    await this.prisma.playlistItem.deleteMany({ where: { playlistId: id } });
    await this.prisma.playlist.delete({ where: { id } });

    return { ok: true };
  }

  async clone(auth: AuthContext, id: string) {
    const src = await this.getScopedPlaylistOrThrow(auth, id);

    const playlist = await this.prisma.playlist.findUnique({
      where: { id: src.id },
      include: { items: { orderBy: { order: "asc" } } },
    });

    if (!playlist) throw new NotFoundException("Playlist not found");

    const created = await this.prisma.playlist.create({
      data: {
        name: `${playlist.name} (copy)`,
        organizationId: auth.organizationId,
        workspaceId: this.requireActiveWorkspaceId(auth),
        createdByUserId: auth.userId,
        isArchived: false,
      },
      select: {
        id: true,
        name: true,
        workspaceId: true,
        organizationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (playlist.items.length) {
      await this.prisma.playlistItem.createMany({
        data: playlist.items.map((it, idx) => ({
          playlistId: created.id,
          mediaId: it.mediaId,
          duration: it.duration ?? 5000,
          order: idx + 1,
        })),
      });
    }

    return created;
  }
}