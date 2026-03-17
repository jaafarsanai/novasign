import { Injectable, Logger } from "@nestjs/common";
import type { Server, Socket } from "socket.io";
import { ScreensService } from "../screens/screens.service";

export type VSState = "PAIR" | "WAITING" | "PLAYING" | "UNKNOWN";

export type VsStatePayload = {
  runtimeKey: string;
  state: VSState;
  updatedAt: number;
  playlistAssigned: boolean;
  exists: boolean;
  screenId: string | null;
  isVirtual: boolean;
  orientation?: any;
};

export type VsPlaylistItem = {
  id: string;
  type: "image" | "video";
  url: string;
  order: number;
  durationMs?: number;
};

export type VsPlaylistPayload = {
  runtimeKey: string;
  playlistId: string | null;
  updatedAt: number;
  items: VsPlaylistItem[];
  channel?: {
    channelId: string;
    layoutId: string | null;
    orientation?: "landscape" | "portrait";
    zones: Record<string, VsPlaylistItem[]>;
    transition?: any;
  };
};

@Injectable()
export class WsStateService {
  private readonly logger = new Logger(WsStateService.name);

  // MUST be root Server (has .of)
  private io: Server | null = null;

  constructor(private readonly screens: ScreensService) {}

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

  private normRuntimeKey(raw: string): string {
    return String(raw || "").trim();
  }

  private normScreenId(raw: string): string {
    return String(raw || "").trim();
  }

  // -----------------------------
  // Virtual-screen runtime channel
  // Room key: screen:{screenId}
  // Runtime auth: runtimeKey
  // -----------------------------
  async pushVirtualScreenStateByRuntimeKey(rawRuntimeKey: string) {
    const io = this.ensureIo();
    const runtimeKey = this.normRuntimeKey(rawRuntimeKey);
    if (!runtimeKey) return;

    const payload = await this.screens.getVirtualScreenStatePayloadByRuntimeKey(runtimeKey);
    if (!payload?.screenId) return payload;

    io.of("/virtual-screen")
      .to(`screen:${payload.screenId}`)
      .emit("vs:state", payload);

    return payload;
  }

  async pushVirtualScreenPlaylistByRuntimeKey(rawRuntimeKey: string) {
    const io = this.ensureIo();
    const runtimeKey = this.normRuntimeKey(rawRuntimeKey);
    if (!runtimeKey) return;

    const payload = await this.screens.getVirtualScreenPlaylistPayloadByRuntimeKey(runtimeKey);
    const state = await this.screens.getVirtualScreenStatePayloadByRuntimeKey(runtimeKey);

    if (!state?.screenId) return payload;

    io.of("/virtual-screen")
      .to(`screen:${state.screenId}`)
      .emit("vs:playlist", payload);

    return payload;
  }

  async pushVirtualScreenBundleByRuntimeKey(rawRuntimeKey: string) {
    const state = await this.pushVirtualScreenStateByRuntimeKey(rawRuntimeKey);
    const playlist = await this.pushVirtualScreenPlaylistByRuntimeKey(rawRuntimeKey);
    return { state, playlist };
  }

  async pushVirtualScreenBundleToClientByRuntimeKey(client: Socket, rawRuntimeKey: string) {
    const runtimeKey = this.normRuntimeKey(rawRuntimeKey);

    if (!runtimeKey) {
      client.emit("vs:state", {
        runtimeKey: "",
        state: "PAIR",
        updatedAt: Date.now(),
        playlistAssigned: false,
        exists: false,
        screenId: null,
        isVirtual: false,
        orientation: "LANDSCAPE",
      } satisfies VsStatePayload);

      client.emit("vs:playlist", {
        runtimeKey: "",
        playlistId: null,
        updatedAt: Date.now(),
        items: [],
      } satisfies VsPlaylistPayload);

      return;
    }

    const state = await this.screens.getVirtualScreenStatePayloadByRuntimeKey(runtimeKey);
    const playlist = await this.screens.getVirtualScreenPlaylistPayloadByRuntimeKey(runtimeKey);

    if (state?.screenId) {
      client.join(`screen:${state.screenId}`);
    }

    client.emit("vs:state", state);
    client.emit("vs:playlist", playlist);
  }

  async pushScreenRefreshByScreenId(rawScreenId: string) {
    const io = this.ensureIo();
    const screenId = this.normScreenId(rawScreenId);
    if (!screenId) return;

    io.of("/virtual-screen")
      .to(`screen:${screenId}`)
      .emit("vs:refresh", { screenId, ts: Date.now() });
  }

  // -----------------------------
  // Admin screens channel helpers
  // -----------------------------
  async pushAdminScreenSnapshot(screenId: string) {
    const io = this.ensureIo();
    const s = await this.screens.getScreenSnapshotByIdInternal(screenId);
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

  broadcastScreenSeen(screenId: string, lastSeenAtIso?: string) {
    const io = this.ensureIo();
    const id = this.normScreenId(screenId);
    if (!id) return;

    io.of("/screens").emit("screens:seen", {
      screenId: id,
      lastSeenAt: lastSeenAtIso ?? new Date().toISOString(),
    });
  }
}