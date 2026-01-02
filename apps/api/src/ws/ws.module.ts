import { Module, forwardRef } from "@nestjs/common";
import { WsStateService } from "./ws-state.service";
import { SocketIoAdapter } from "./socket-io.adapter";
import { VirtualScreenGateway } from "./virtual-screen.gateway";
import { ScreensGateway } from "./screens.gateway";
import { ScreensModule } from "../screens/screens.module";

@Module({
  imports: [forwardRef(() => ScreensModule)],
  providers: [WsStateService, SocketIoAdapter, VirtualScreenGateway, ScreensGateway],
  exports: [WsStateService],
})
export class WsModule {}

