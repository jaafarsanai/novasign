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
    private readonly screens: ScreensService
  ) {}

  afterInit(server: any) {
    this.wsState.bindServer(server?.server ?? server);
    this.logger.log("VirtualScreenGateway initialized");
  }

  handleConnection(client: Socket) {
    const code = String(client.handshake.query?.code ?? "").trim().toUpperCase();
    const role = String(client.handshake.query?.role ?? "virtual")
      .trim()
      .toLowerCase(); // "virtual" | "device"

    (client.data as any).role = role;
    (client.data as any).code = code;

    // ✅ Only virtual tabs affect "virtual active" logic
    if (role !== "device" && code) {
      this.screens.markVirtualConnected(code);
    }
  }

  handleDisconnect(client: Socket) {
    const code =
      String((client.data as any)?.code ?? client.handshake.query?.code ?? "")
        .trim()
        .toUpperCase();

    const role = String((client.data as any)?.role ?? "virtual")
      .trim()
      .toLowerCase();

    if (role !== "device" && code) {
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

    const role = String((client.data as any)?.role ?? "virtual")
      .trim()
      .toLowerCase();

    (client.data as any).code = code;

    client.join(`code:${code}`);

    // ✅ CRITICAL: device must NOT mark virtual connected here
    if (role !== "device") {
      this.screens.markVirtualConnected(code);
    }

    const s = await this.screens.getByPairingCodeOrNull(code);
    if (s) {
      await this.screens.touchLastSeenById(s.id);
      await this.wsState.pushAdminScreenSnapshot(s.id);
    }

    const state = await this.screens.getVirtualScreenStatePayload(code);
    const playlist = await this.screens.getVirtualScreenPlaylistPayload(code);

    client.emit("vs:state", state);
    client.emit("vs:playlist", playlist);
    client.emit("vs:bundle", { state, playlist });
  }
}