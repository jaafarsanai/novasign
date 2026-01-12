import { Injectable, Logger } from "@nestjs/common";
import type { Server, Socket } from "socket.io";
import { ScreensService } from "../screens/screens.service";

export type VSState = "PAIR" | "WAITING" | "PLAYING" | "UNKNOWN";

export type VsStatePayload = {
  code: string;
  state: VSState;
  updatedAt: number;
  playlistAssigned: boolean;
};

export type VsPlaylistItem = {
  id: string;
  type: "image" | "video";
  url: string;
  order: number;
  durationMs?: number;
};

export type VsPlaylistPayload = {
  code: string;
  playlistId: string | null;
  updatedAt: number;
  items: VsPlaylistItem[];
};

@Injectable()
export class WsStateService {
  private readonly logger = new Logger(WsStateService.name);

  // MUST be root Server (has .of)
  private io: Server | null = null;

  constructor(private readonly screens: ScreensService) {}

  // Accept either Server or Namespace-like objects and normalize
  bindServer(anyServer: any) {
    const s = anyServer?.of ? anyServer : anyServer?.server?.of ? anyServer.server : null;
    if (!s) {
      this.logger.warn("bindServer called with non-root server; ignoring");
      return;
    }
    this.io = s;
    this.logger.log("Socket.IO server registered (bindServer)");
  }

  setIo(io: any) {
    this.bindServer(io);
  }
  setServer(io: any) {
    this.bindServer(io);
  }
  bindIo(io: any) {
    this.bindServer(io);
  }

  private ensureIo(): Server {
    if (!this.io) throw new Error("Socket.IO server not registered in WsStateService");
    return this.io;
  }

  private normCode(raw: string): string {
    return (raw || "").trim().toUpperCase();
  }

  // -----------------------------
  // Virtual-screen channel
  // -----------------------------
  async pushVirtualScreenState(rawCode: string) {
    const io = this.ensureIo();
    const code = this.normCode(rawCode);
    if (!code) return;

    const payload = await this.screens.getVirtualScreenStatePayload(code);
    io.of("/virtual-screen").to(`code:${payload.code}`).emit("vs:state", payload);
    return payload;
  }

  async pushVirtualScreenPlaylist(rawCode: string) {
    const io = this.ensureIo();
    const code = this.normCode(rawCode);
    if (!code) return;

    const payload = await this.screens.getVirtualScreenPlaylistPayload(code);
    io.of("/virtual-screen").to(`code:${payload.code}`).emit("vs:playlist", payload);
    return payload;
  }

  async pushVirtualScreenBundle(rawCode: string) {
    const state = await this.pushVirtualScreenState(rawCode);
    const playlist = await this.pushVirtualScreenPlaylist(rawCode);
    return { state, playlist };
  }

  async pushVirtualScreenBundleToClient(client: Socket, rawCode: string) {
    const code = this.normCode(rawCode);
    if (!code) {
      client.emit("vs:state", {
        code: "",
        state: "PAIR",
        updatedAt: Date.now(),
        playlistAssigned: false,
      } satisfies VsStatePayload);
      client.emit("vs:playlist", {
        code: "",
        playlistId: null,
        updatedAt: Date.now(),
        items: [],
      } satisfies VsPlaylistPayload);
      return;
    }

    const state = await this.screens.getVirtualScreenStatePayload(code);
    const playlist = await this.screens.getVirtualScreenPlaylistPayload(code);

    client.emit("vs:state", state);
    client.emit("vs:playlist", playlist);
  }

  async pushVirtualScreenRefresh(rawCode: string) {
    const io = this.ensureIo();
    const code = this.normCode(rawCode);
    if (!code) return;

    io.of("/virtual-screen").to(`code:${code}`).emit("vs:refresh", { code, ts: Date.now() });
  }

  // -----------------------------
  // Admin screens channel helpers
  // -----------------------------
  async pushAdminScreenSnapshot(screenId: string) {
    const io = this.ensureIo();
    const s = await this.screens.getAdminScreenSnapshotById(screenId);
    if (!s) return;

    io.of("/screens").emit("screens:snapshot", s);
  }

  async pushAdminScreenDeleted(screenId: string) {
    const io = this.ensureIo();
    io.of("/screens").emit("screens:deleted", { id: screenId });
  }

  // -----------------------------
  // Admin screens channel (broadcast)
  // -----------------------------
  broadcastScreensChanged(reason?: string) {
    const io = this.ensureIo();
    io.of("/screens").emit("screens:changed", { reason, ts: Date.now() });
  }

  broadcastScreenSeen(pairingCode: string, lastSeenAtIso?: string) {
    const io = this.ensureIo();
    const code = this.normCode(pairingCode);
    if (!code) return;
    io.of("/screens").emit("screens:seen", {
      pairingCode: code,
      lastSeenAt: lastSeenAtIso ?? new Date().toISOString(),
    });
  }
}

