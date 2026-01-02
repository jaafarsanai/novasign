import { Logger } from "@nestjs/common";
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
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
    // normalize: ensure WsStateService receives root server
    this.wsState.bindServer(server?.server ?? server);
    this.logger.log("VirtualScreenGateway initialized");
  }

  handleConnection(client: Socket) {
    const code = String(client.handshake?.query?.code ?? "").trim().toUpperCase();
    if (code) client.join(`code:${code}`);
  }

  @SubscribeMessage("vs:ping")
async onPing(
  @ConnectedSocket() client: Socket,
  @MessageBody() body: { code?: string }
) {
  const code = String(body?.code ?? "").trim().toUpperCase();
  if (!code) return;

  client.join(`code:${code}`);

  // Update lastSeenAt if screen exists
  const s = await this.screens.getByPairingCodeOrNull(code);
  if (s) {
    await this.screens.touchLastSeenById(s.id);

    // push realtime snapshot to admin (/screens namespace)
    await this.wsState.pushAdminScreenSnapshot(s.id);
  }

  // push deterministic bundle to this client (virtual screen)
  await this.wsState.pushVirtualScreenBundleToClient(client, code);
}

}

