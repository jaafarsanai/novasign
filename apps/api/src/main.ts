import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { SocketIoAdapter } from "./ws/socket-io.adapter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: { origin: true, credentials: true },
  });

  // ✅ REST endpoints stay under /api/*
  app.setGlobalPrefix("api");

  // ✅ Socket.IO stays on /ws (not affected by global prefix)
  app.useWebSocketAdapter(new SocketIoAdapter(app));

  await app.listen(3001);
}
bootstrap();

