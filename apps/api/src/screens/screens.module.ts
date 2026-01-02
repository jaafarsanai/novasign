import { Module, forwardRef } from "@nestjs/common";
import { ScreensController } from "./screens.controller";
import { ScreensService } from "./screens.service";
import { WsModule } from "../ws/ws.module";

@Module({
  imports: [forwardRef(() => WsModule)],
  controllers: [ScreensController],
  providers: [ScreensService],
  exports: [ScreensService],
})
export class ScreensModule {}

