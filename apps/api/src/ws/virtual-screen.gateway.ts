import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { WsStateService } from "../ws/ws-state.service";
import { ScreensService } from "../screens/screens.service";

@WebSocketGateway({
  namespace: "/virtual-screen",
})
export class VirtualScreenGateway {
  private readonly logger = new Logger(VirtualScreenGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly wsState: WsStateService,
    private readonly screens: ScreensService,
  ) {}

  afterInit(server: any) {
    this.wsState.bindServer(server?.server ?? server);
    this.logger.log("VirtualScreenGateway initialized");
  }

  async handleConnection(client: Socket) {
    try {
      const runtimeKey = String(client.handshake.query?.runtimeKey ?? "").trim();
      const role = String(client.handshake.query?.role ?? "virtual")
        .trim()
        .toLowerCase();

      (client.data as any).role = role;
      (client.data as any).runtimeKey = runtimeKey;

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
        });
        return;
      }

      const state = await this.screens.getVirtualScreenStatePayloadByRuntimeKey(runtimeKey);

      if (!state?.screenId) {
        client.emit("vs:state", state);
        return;
      }

      (client.data as any).screenId = state.screenId;
      client.join(`screen:${state.screenId}`);

      await this.screens.touchLastSeenByRuntimeKey(runtimeKey);
      await this.wsState.pushAdminScreenSnapshot(state.screenId);

      const nowIso = new Date().toISOString();
      await this.wsState.broadcastScreenSeen(state.screenId, nowIso);

      await this.wsState.pushVirtualScreenBundleToClientByRuntimeKey(client, runtimeKey);
    } catch (error) {
      this.logger.error("Virtual screen connection failed", error as any);
      
    }
  }

  async handleDisconnect(client: Socket) {
    const screenId = String((client.data as any)?.screenId ?? "").trim();
    if (!screenId) return;

    this.logger.debug(`Virtual-screen socket disconnected from screen room ${screenId}`);
  }

  @SubscribeMessage("vs:ping")
  async onPing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { runtimeKey?: string },
  ) {
    try {
      const runtimeKey = String(
        body?.runtimeKey ?? (client.data as any)?.runtimeKey ?? "",
      ).trim();

      if (!runtimeKey) {
        client.emit("vs:error", {
          code: "MISSING_RUNTIME_KEY",
          message: "Missing runtime key",
        });
        return;
      }

      (client.data as any).runtimeKey = runtimeKey;

      const state = await this.screens.getVirtualScreenStatePayloadByRuntimeKey(runtimeKey);

      if (!state?.screenId) {
        client.emit("vs:state", state);
        client.emit("vs:playlist", {
          runtimeKey,
          playlistId: null,
          updatedAt: Date.now(),
          items: [],
        });
        return;
      }

      (client.data as any).screenId = state.screenId;
      client.join(`screen:${state.screenId}`);

      await this.screens.touchLastSeenByRuntimeKey(runtimeKey);
      await this.wsState.pushAdminScreenSnapshot(state.screenId);

      const nowIso = new Date().toISOString();
      await this.wsState.broadcastScreenSeen(state.screenId, nowIso);

      const playlist = await this.screens.getVirtualScreenPlaylistPayloadByRuntimeKey(runtimeKey);

      client.emit("vs:state", state);
      client.emit("vs:playlist", playlist);
      client.emit("vs:bundle", { state, playlist });
    } catch (error) {
      this.logger.error("Virtual screen ping failed", error as any);
      client.emit("vs:error", {
        code: "RUNTIME_RESOLUTION_FAILED",
        message: "Unable to resolve runtime session",
      });
    }
  }
}