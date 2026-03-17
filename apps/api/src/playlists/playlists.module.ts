import { Module } from "@nestjs/common";
import { PlaylistsController } from "./playlists.controller";
import { PlaylistsService } from "./playlists.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PlaylistsController],
  providers: [PlaylistsService],
  exports: [PlaylistsService],
})
export class PlaylistsModule {}