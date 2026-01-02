import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ScreensService } from "./screens.service";
import { WsStateService } from "../ws/ws-state.service";

@Controller("screens")
export class ScreensController {
  constructor(
    private readonly screens: ScreensService,
    private readonly wsState: WsStateService
  ) {}

  @Get()
  async list() {
    const rows = await this.screens.listScreens();
    return rows.map((s: any) => ({
      id: s.id,
      name: s.name,
      pairingCode: s.pairingCode,
      pairedAt: s.pairedAt,
      lastSeenAt: s.lastSeenAt,
      isVirtual: !!s.isVirtual,
      assignedPlaylistId: s.assignedPlaylistId ?? null,
      assignedPlaylistName: s.assignedPlaylist?.name ?? null,
    }));
  }

  @Post("virtual-session")
  async createVirtualSession() {
    return this.screens.createVirtualSession();
  }

  @Post("pair")
  async pair(@Body() body: { code: string }) {
    const updated = await this.screens.pairByCodeUpsert(body?.code);

    await this.wsState.pushVirtualScreenBundle(updated.pairingCode);
    this.wsState.broadcastScreensChanged("pair");

    return { ok: true, id: updated.id };
  }

  @Post(":id/assign-playlist")
  async assignPlaylist(@Param("id") id: string, @Body() body: { playlistId: string | null }) {
    const updated = await this.screens.assignPlaylist(id, body?.playlistId ?? null);

    // If you can retrieve code here, do it. Otherwise just broadcast changed.
    // (Best: return code from assignPlaylist service or query it here.)
    this.wsState.broadcastScreensChanged("assign-playlist");

    return { ok: true };
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    const code = await this.screens.deleteByIdAndReturnCode(id);

    // force virtual-screen room UI to update if a tab is open
    await this.wsState.pushVirtualScreenState(code);
    await this.wsState.pushVirtualScreenPlaylist(code);

    this.wsState.broadcastScreensChanged("delete");
    return { ok: true };
  }
}

