import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  BadRequestException,
} from "@nestjs/common";
import { PlaylistsService } from "./playlists.service";

@Controller("playlists")
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Get()
  async list() {
    return this.playlists.list();
  }

  @Post()
  async create(@Body() body: { name?: string }) {
    const name = String(body?.name ?? "New Playlist").trim() || "New Playlist";
    return this.playlists.create(name);
  }
@Post(":id/duplicate")
  async duplicate(@Param("id") id: string) {
    const created = await this.playlists.duplicateById(id);
    return { id: created.id };
  }
  @Get(":id")
  async get(@Param("id") id: string) {
    return this.playlists.get(id);
  }

  // IMPORTANT: Media picker expects this sometimes
  @Get(":id/items")
  async listItems(@Param("id") id: string) {
    const items = await this.playlists.listItems(id);
  return { items }; // IMPORTANT: frontend expects { items: [...] }
  }

  @Patch(":id")
  async rename(@Param("id") id: string, @Body() body: { name?: string }) {
    const name = String(body?.name ?? "").trim();
    if (!name) throw new BadRequestException("name is required");
    return this.playlists.rename(id, name);
  }

  @Post(":id/items/reorder")
  async reorder(@Param("id") id: string, @Body() body: { itemIds?: string[] }) {
    const itemIds = Array.isArray(body?.itemIds) ? body.itemIds : [];
    if (itemIds.length === 0) throw new BadRequestException("itemIds must be a non-empty array");
    return this.playlists.reorderItems(id, itemIds);
  }

  @Patch(":id/items/:itemId")
  async updateItem(
    @Param("id") playlistId: string,
    @Param("itemId") itemId: string,
    @Body() body: { durationMs?: number; duration?: number }
  ) {
    const durationMsRaw = body?.durationMs ?? body?.duration;
    const durationMs = Number(durationMsRaw);

    if (!Number.isFinite(durationMs) || durationMs < 100) {
      throw new BadRequestException("durationMs must be a number >= 100");
    }

    return this.playlists.updateItemDuration(playlistId, itemId, durationMs);
  }

  // IMPORTANT: attach selected existing media to playlist
  // Accepts { mediaIds: [...] } or { mediaId: "..." }
  @Post(":id/items")
  async addExisting(
    @Param("id") playlistId: string,
    @Body() body: { mediaIds?: string[]; mediaId?: string; durationMs?: number }
  ) {
    const ids =
      Array.isArray(body?.mediaIds) ? body.mediaIds :
      body?.mediaId ? [body.mediaId] :
      [];

    if (ids.length === 0) throw new BadRequestException("mediaIds (or mediaId) is required");

    return this.playlists.addExistingMediaToPlaylist(playlistId, ids, body?.durationMs);
  }

  // FIX: delete playlist item (your UI currently gets 404)
  @Delete(":id/items/:itemId")
  async deleteItem(@Param("id") playlistId: string, @Param("itemId") itemId: string) {
    return this.playlists.deleteItem(playlistId, itemId);
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    return this.playlists.remove(id);
  }

  @Post(":id/clone")
  async clone(@Param("id") id: string) {
    return this.playlists.clone(id);
  }
}

