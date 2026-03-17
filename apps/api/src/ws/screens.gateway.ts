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
import { WsStateService } from "./ws-state.service";

@WebSocketGateway({
  namespace: "/screens",
})
export class ScreensGateway {
  private readonly logger = new Logger(ScreensGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly screens: ScreensService,
    private readonly wsState: WsStateService,
  ) {}

  afterInit(_server: any) {
    this.logger.log("ScreensGateway initialized");
  }

  async handleConnection(client: Socket) {
    const runtimeKey = String(client.handshake?.query?.runtimeKey ?? "").trim();
    if (!runtimeKey) return;

    const screen = await this.screens.getByRuntimeKeyOrNull(runtimeKey);
    if (!screen) return;

    client.join(`screen:${screen.id}`);
    (client.data as any).runtimeKey = runtimeKey;
    (client.data as any).screenId = screen.id;
  }

  @SubscribeMessage("screen:ping")
  async onPing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { runtimeKey?: string },
  ) {
    const runtimeKey =
      String(body?.runtimeKey ?? (client.data as any)?.runtimeKey ?? "").trim();

    if (!runtimeKey) return;

    const screen = await this.screens.getByRuntimeKeyOrNull(runtimeKey);
    if (!screen) return;

    client.join(`screen:${screen.id}`);
    (client.data as any).runtimeKey = runtimeKey;
    (client.data as any).screenId = screen.id;

    await this.screens.touchLastSeenById(screen.id);
    await this.wsState.broadcastScreenSeen(screen.id);

    client.emit("screen:pong", {
      ok: true,
      screenId: screen.id,
      ts: Date.now(),
    });
  }
}