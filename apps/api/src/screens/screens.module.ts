import { Module, forwardRef } from "@nestjs/common";
import { ScreensController } from "./screens.controller";
import { ScreensService } from "./screens.service";
import { WsModule } from "../ws/ws.module";
import { PrismaService } from "../prisma/prisma.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [forwardRef(() => WsModule), AuthModule],
  controllers: [ScreensController],
  providers: [ScreensService, PrismaService],
  exports: [ScreensService],
})
export class ScreensModule {}