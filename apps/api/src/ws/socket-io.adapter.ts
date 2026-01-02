import { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import type { ServerOptions } from "socket.io";
import { WsStateService } from "./ws-state.service";

export class SocketIoAdapter extends IoAdapter {
  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  createIOServer(port: number, options?: any) {
    const base: Partial<ServerOptions> = {
      path: "/ws",
      cors: { origin: true, credentials: true },
      transports: ["polling", "websocket"],
      serveClient: false,
    };

    const server = super.createIOServer(port, {
      ...(options ?? {}),
      ...(base as any),
    });

    // Bind server to WsStateService so controllers can push state
    try {
      const wsState = this.app.get(WsStateService);
      wsState.bindServer(server);
    } catch {
      // ignore if not ready
    }

    return server;
  }
}

