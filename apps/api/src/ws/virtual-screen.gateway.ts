import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { WsStateService } from "./ws-state.service";
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
    private readonly screens: ScreensService
  ) {}

  afterInit(server: any) {
    this.wsState.bindServer(server?.server ?? server);
    this.logger.log("VirtualScreenGateway initialized");
  }

  handleConnection(client: Socket) {
    const code = String(client.handshake?.query?.code ?? "").trim().toUpperCase();
    if (code) {
      client.join(`code:${code}`);
      this.screens.markVirtualConnected(code);
    }
  }

  handleDisconnect(client: Socket) {
    const code = String(client.handshake?.query?.code ?? "").trim().toUpperCase();
    if (code) {
      this.screens.markVirtualDisconnected(code);
    }
  }

  @SubscribeMessage("vs:ping")
  async onPing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { code?: string }
  ) {
    const code = String(body?.code ?? "").trim().toUpperCase();
    if (!code) return;

    client.join(`code:${code}`);
    this.screens.markVirtualConnected(code);

    const s = await this.screens.getByPairingCodeOrNull(code);
    if (s) {
      await this.screens.touchLastSeenById(s.id);
      await this.wsState.pushAdminScreenSnapshot(s.id);
    }

    // Keep existing behavior
    await this.wsState.pushVirtualScreenBundleToClient(client, code);

    // Add a direct, deterministic fallback so the page can always play content
    // even if WS-state event naming changes.
    const state = await this.screens.getVirtualScreenStatePayload(code);
    const playlist = await this.screens.getVirtualScreenPlaylistPayload(code);

    client.emit("vs:state", state);
    client.emit("vs:playlist", playlist);
    client.emit("vs:bundle", { state, playlist });
  }
}

