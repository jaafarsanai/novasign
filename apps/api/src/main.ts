import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { SocketIoAdapter } from "./ws/socket-io.adapter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: { origin: true, credentials: true },
  });

  app.setGlobalPrefix("api");
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  // IMPORTANT: make Socket.IO use /ws
  app.useWebSocketAdapter(new SocketIoAdapter(app));

  await app.listen(3001);
}
bootstrap();