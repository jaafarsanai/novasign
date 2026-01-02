import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

@WebSocketGateway({ namespace: "/screens" })
export class ScreensGateway {
  @WebSocketServer()
  server!: Server;

  handleConnection(_client: Socket) {
    // no-op; events are emitted from WsStateService
  }
}


