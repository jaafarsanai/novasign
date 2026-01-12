import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
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

    return rows.map((s: any) => {
      const virtualSessionId = s.isVirtual ? this.screens.ensureVirtualSessionForCode(s.pairingCode) : null;

      return {
        id: s.id,
        name: s.name,
        pairingCode: s.pairingCode,
        pairedAt: s.pairedAt,
        lastSeenAt: s.lastSeenAt,
        isVirtual: !!s.isVirtual,
        assignedPlaylistId: s.assignedPlaylistId ?? null,
        assignedPlaylistName: s.assignedPlaylist?.name ?? null,
        virtualSessionId,
      };
    });
  }

  @Post("virtual-session")
  async createVirtualSession() {
    return this.screens.createVirtualSession(); // { id, code }
  }

  @Get("virtual-session/:id")
  async getVirtualSession(@Param("id") id: string) {
    const s = this.screens.getVirtualSessionByIdOrNull(id);
    if (!s) throw new NotFoundException("Virtual session not found");
    return { id: s.id, code: s.pairingCode };
  }

  @Post("pair")
  async pair(@Body() body: { code: string }) {
    const updated = await this.screens.pairByCodeUpsert(body?.code);

    await this.wsState.pushVirtualScreenBundle(updated.pairingCode);
    await this.wsState.pushAdminScreenSnapshot(updated.id);
    this.wsState.broadcastScreensChanged("pair");

    return { ok: true, id: updated.id };
  }

  @Post(":id/assign-playlist")
  async assignPlaylist(@Param("id") id: string, @Body() body: { playlistId: string | null }) {
    const updated = await this.screens.assignPlaylist(id, body?.playlistId ?? null);

    // Push to virtual screen room (if open) so it updates quickly
    const snap = await this.screens.getAdminScreenSnapshotById(updated.id);
    if (snap?.pairingCode) {
      await this.wsState.pushVirtualScreenState(snap.pairingCode);
      await this.wsState.pushVirtualScreenPlaylist(snap.pairingCode);
    }

    await this.wsState.pushAdminScreenSnapshot(updated.id);
    this.wsState.broadcastScreensChanged("assign-playlist");

    return { ok: true };
  }

  @Patch(":id")
  async rename(@Param("id") id: string, @Body() body: { name: string }) {
    const name = String(body?.name ?? "").trim();
    if (!name) throw new BadRequestException("Name cannot be empty.");

    const updated = await this.screens.renameScreenById(id, name);

    await this.wsState.pushAdminScreenSnapshot(updated.id);
    this.wsState.broadcastScreensChanged("rename");

    if (updated?.pairingCode) {
      await this.wsState.pushVirtualScreenState(updated.pairingCode);
    }

    return { ok: true };
  }

  @Post(":id/refresh")
  async refresh(@Param("id") id: string) {
    const snap = await this.screens.getAdminScreenSnapshotById(id);
    if (!snap) throw new NotFoundException("Screen not found");

    if (snap.pairingCode) {
      await this.wsState.pushVirtualScreenState(snap.pairingCode);
      await this.wsState.pushVirtualScreenPlaylist(snap.pairingCode);
      await this.wsState.pushVirtualScreenRefresh(snap.pairingCode);
    }

    await this.wsState.pushAdminScreenSnapshot(id);
    this.wsState.broadcastScreensChanged("refresh");

    return { ok: true };
  }

  @Delete(":id")
  async delete(@Param("id") id: string) {
    const code = await this.screens.deleteByIdAndReturnCode(id);

    await this.wsState.pushVirtualScreenState(code);
    await this.wsState.pushVirtualScreenPlaylist(code);

    await this.wsState.pushAdminScreenDeleted(id);
    this.wsState.broadcastScreensChanged("delete");

    return { ok: true };
  }
}

