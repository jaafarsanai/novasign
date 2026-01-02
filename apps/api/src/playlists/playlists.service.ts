import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PlaylistsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.playlist.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
  }

  async create(name: string) {
    return this.prisma.playlist.create({
      data: { name },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
  }

  async get(id: string) {
    const p = await this.prisma.playlist.findUnique({
      where: { id },
      include: { items: { orderBy: { order: "asc" }, include: { media: true } } },
    });
    if (!p) throw new NotFoundException("Playlist not found");
    return p;
  }

  async listItems(playlistId: string) {
    const exists = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Playlist not found");

    return this.prisma.playlistItem.findMany({
      where: { playlistId },
      orderBy: { order: "asc" },
      include: { media: true },
    });
  }

  async rename(id: string, name: string) {
    return this.prisma.playlist.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
  }

  async reorderItems(playlistId: string, itemIds: string[]) {
    const exists = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Playlist not found");

    const ops = itemIds.map((itemId, idx) =>
      this.prisma.playlistItem.updateMany({
        where: { id: itemId, playlistId },
        data: { order: idx + 1 },
      })
    );

    await this.prisma.$transaction(ops);
    return { ok: true };
  }

  async updateItemDuration(playlistId: string, itemId: string, durationMs: number) {
    const res = await this.prisma.playlistItem.updateMany({
      where: { id: itemId, playlistId },
      data: { duration: durationMs },
    });

    if (res.count === 0) throw new NotFoundException("Playlist item not found for this playlist");
    return { ok: true };
  }

  // Attach existing media(s) to playlist
  async addExistingMediaToPlaylist(playlistId: string, mediaIds: string[], durationMs?: number) {
    const pl = await this.prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { id: true },
    });
    if (!pl) throw new NotFoundException("Playlist not found");

    const mediaRows = await this.prisma.media.findMany({
      where: { id: { in: mediaIds } },
    });
    if (mediaRows.length === 0) throw new NotFoundException("No media found");

    const maxOrderRow = await this.prisma.playlistItem.findFirst({
      where: { playlistId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    let orderCursor = (maxOrderRow?.order ?? 0) + 1;

    const created: any[] = [];

    for (const m of mediaRows) {
      // ✅ Videos inherit duration from library when available
      const defaultDuration =
        m.type === "image" ? 5000 : (typeof m.durationMs === "number" ? m.durationMs : null);

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

  async deleteItem(playlistId: string, itemId: string) {
    // ✅ Remove ONLY from playlist. Do NOT delete Media from library.
    const item = await this.prisma.playlistItem.findFirst({
      where: { id: itemId, playlistId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException("Playlist item not found");

    await this.prisma.playlistItem.delete({ where: { id: item.id } });
    return { ok: true };
  }

  async remove(id: string) {
    await this.prisma.playlistItem.deleteMany({ where: { playlistId: id } });
    await this.prisma.playlist.delete({ where: { id } });
    return { ok: true };
  }

  async clone(id: string) {
    const src = await this.prisma.playlist.findUnique({
      where: { id },
      include: { items: { orderBy: { order: "asc" } } },
    });
    if (!src) throw new NotFoundException("Playlist not found");

    const created = await this.prisma.playlist.create({
      data: { name: `${src.name} (copy)` },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    if (src.items.length) {
      await this.prisma.playlistItem.createMany({
        data: src.items.map((it, idx) => ({
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

