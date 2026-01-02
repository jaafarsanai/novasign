import { Module } from "@nestjs/common";

import { ScreensModule } from "./screens/screens.module";
import { WsModule } from "./ws/ws.module";

// Keep these imports only if they exist in your project.
// If TypeScript complains they don't exist, remove them.
import { PlaylistsModule } from "./playlists/playlists.module";
import { MediaModule } from "./media/media.module";
import { ChannelsModule } from "./channels/channels.module";

@Module({
  imports: [
    // ✅ This mounts /api/screens (because ScreensController is inside)
    ScreensModule,

    // Other modules (remove if they don't exist in your codebase)
    PlaylistsModule,
    MediaModule,
    ChannelsModule,
    // WS module can stay
    WsModule,
  ],
})
export class AppModule {}

