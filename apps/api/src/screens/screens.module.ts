import { Module, forwardRef } from "@nestjs/common";
import { ScreensController } from "./screens.controller";
import { ScreensService } from "./screens.service";
import { WsModule } from "../ws/ws.module";
import { PrismaService } from "../prisma/prisma.service"; // ✅ add

@Module({
  imports: [forwardRef(() => WsModule)],
  controllers: [ScreensController],
  providers: [ScreensService, PrismaService], // ✅ add
  exports: [ScreensService],
})
export class ScreensModule {}