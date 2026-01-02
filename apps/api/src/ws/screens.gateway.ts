import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { ScreensService } from "../screens/screens.service";

@WebSocketGateway({
  namespace: "/screens",
})
export class ScreensGateway {
  private readonly logger = new Logger(ScreensGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly screens: ScreensService) {}

  afterInit(server: any) {
    this.logger.log("ScreensGateway initialized");
  }

  handleConnection(client: Socket) {
    // For devices you can pass pairingCode in query, but keep it permissive
    const code = String(client.handshake?.query?.code ?? "").trim().toUpperCase();
    if (code) client.join(`screen:${code}`);
  }

  @SubscribeMessage("screen:ping")
  async onPing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { code?: string }
  ) {
    const code = String(body?.code ?? "").trim().toUpperCase();
    if (!code) return;

    client.join(`screen:${code}`);

    // ✅ updates lastSeenAt if the screen exists
    await this.screens.touchLastSeenByPairingCode(code);

    // Optional ack (useful for device debugging)
    client.emit("screen:pong", { ok: true, code, ts: Date.now() });
  }
}

