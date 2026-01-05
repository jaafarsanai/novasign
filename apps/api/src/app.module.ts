import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

import { ScreensModule } from "./screens/screens.module";
import { WsModule } from "./ws/ws.module";
import { PlaylistsModule } from "./playlists/playlists.module";
import { MediaModule } from "./media/media.module";
import { ChannelsModule } from "./channels/channels.module";

@Module({
  imports: [ScreensModule, PlaylistsModule, MediaModule, ChannelsModule, WsModule],
  controllers: [HealthController],
})
export class AppModule {}

