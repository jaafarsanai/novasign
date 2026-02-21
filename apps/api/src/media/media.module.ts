import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { MediaFoldersController } from "./media-folders.controller";
import { MediaFoldersService } from "./media-folders.service";
import { MediaStreamController } from "./media-stream.controller";

@Module({
  controllers: [MediaController, MediaFoldersController, MediaStreamController],
  providers: [MediaService, MediaFoldersService, PrismaService],
})
export class MediaModule {}
