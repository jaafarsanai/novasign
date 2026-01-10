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

  /**
   * Backward-compatible endpoint you already use.
   * Now returns { id, pairingCode, code } so old callers can still read `.code`.
   */
  @Post("virtual-session")
  async createVirtualSession() {
    const created = await this.screens.createVirtualSession();
    return {
      id: created.id,
      pairingCode: created.pairingCode,
      code: created.pairingCode,
    };
  }

  /**
   * New endpoints used by VirtualScreenPage.tsx
   */
  @Post("virtual-sessions")
  async createVirtualSessionV2() {
    return this.screens.createVirtualSession(); // { id, pairingCode }
  }

  @Post("virtual-sessions/for-code")
  async createVirtualSessionForCode(@Body() body: { code: string }) {
    return this.screens.createVirtualSessionForCode(body?.code); // { id, pairingCode }
  }

  @Get("virtual-sessions/:id")
  async getVirtualSession(@Param("id") id: string) {
    return this.screens.getVirtualSession(id); // { id, pairingCode }
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
    await this.screens.assignPlaylist(id, body?.playlistId ?? null);

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

