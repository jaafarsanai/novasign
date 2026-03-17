import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PlaylistsService } from "./playlists.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentAuth } from "../auth/current-auth.decorator";
import type { AuthContext } from "../auth/interfaces/auth-context.interface";

@Controller("playlists")
@UseGuards(JwtAuthGuard)
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext) {
    return this.playlists.list(auth);
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() body: { name?: string },
  ) {
    const name = String(body?.name ?? "New Playlist").trim() || "New Playlist";
    return this.playlists.create(auth, name);
  }

  @Post(":id/duplicate")
  async duplicate(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    const created = await this.playlists.duplicateById(auth, id);
    return { id: created.id };
  }

  @Get(":id")
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    return this.playlists.get(auth, id);
  }

  @Get(":id/items")
  async listItems(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    const items = await this.playlists.listItems(auth, id);
    return { items };
  }

  @Patch(":id")
  async rename(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: { name?: string },
  ) {
    const name = String(body?.name ?? "").trim();
    if (!name) throw new BadRequestException("name is required");
    return this.playlists.rename(auth, id, name);
  }

  @Post(":id/items/reorder")
  async reorder(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: { itemIds?: string[] },
  ) {
    const itemIds = Array.isArray(body?.itemIds) ? body.itemIds : [];
    if (itemIds.length === 0) {
      throw new BadRequestException("itemIds must be a non-empty array");
    }
    return this.playlists.reorderItems(auth, id, itemIds);
  }

  @Patch(":id/items/:itemId")
  async updateItem(
    @CurrentAuth() auth: AuthContext,
    @Param("id") playlistId: string,
    @Param("itemId") itemId: string,
    @Body() body: { durationMs?: number; duration?: number },
  ) {
    const durationMsRaw = body?.durationMs ?? body?.duration;
    const durationMs = Number(durationMsRaw);

    if (!Number.isFinite(durationMs) || durationMs < 100) {
      throw new BadRequestException("durationMs must be a number >= 100");
    }

    return this.playlists.updateItemDuration(auth, playlistId, itemId, durationMs);
  }

  @Post(":id/items")
  async addExisting(
    @CurrentAuth() auth: AuthContext,
    @Param("id") playlistId: string,
    @Body() body: { mediaIds?: string[]; mediaId?: string; durationMs?: number },
  ) {
    const ids = Array.isArray(body?.mediaIds)
      ? body.mediaIds
      : body?.mediaId
        ? [body.mediaId]
        : [];

    if (ids.length === 0) {
      throw new BadRequestException("mediaIds (or mediaId) is required");
    }

    return this.playlists.addExistingMediaToPlaylist(auth, playlistId, ids, body?.durationMs);
  }

  @Delete(":id/items/:itemId")
  async deleteItem(
    @CurrentAuth() auth: AuthContext,
    @Param("id") playlistId: string,
    @Param("itemId") itemId: string,
  ) {
    return this.playlists.deleteItem(auth, playlistId, itemId);
  }

  @Delete(":id")
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    return this.playlists.remove(auth, id);
  }

  @Post(":id/clone")
  async clone(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    return this.playlists.clone(auth, id);
  }
}