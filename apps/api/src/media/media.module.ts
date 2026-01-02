import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { PlaylistUploadController } from "./playlist-upload.controller";
import { MediaFoldersController } from "./media-folders.controller";
import { MediaFoldersService } from "./media-folders.service";

@Module({
  imports: [PrismaModule],
  controllers: [
    MediaController,
    MediaFoldersController,
    PlaylistUploadController,
  ],
  providers: [MediaService, MediaFoldersService],
  exports: [MediaService],
})
export class MediaModule {}

