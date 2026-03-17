import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";

import { ScreensModule } from "./screens/screens.module";
import { WsModule } from "./ws/ws.module";
import { PlaylistsModule } from "./playlists/playlists.module";
import { MediaModule } from "./media/media.module";
import { ChannelsModule } from "./channels/channels.module";
import { LicensesModule } from "./licenses/licenses.module";
import { AuthModule } from "./auth/auth.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";
import { OrganizationsModule } from "./organizations/organizations.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    LicensesModule,
    WorkspacesModule,
    OrganizationsModule,
    ScreensModule,
    PlaylistsModule,
    MediaModule,
    ChannelsModule,
    WsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}