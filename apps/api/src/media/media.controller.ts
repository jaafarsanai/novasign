import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,  // ✅ add
  Param,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { MediaService } from "./media.service";

@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  async list(
    @Query("search") search?: string,
    @Query("type") type?: string,
    @Query("folderId") folderId?: string
  ) {
    const items = await this.media.list({
      search,
      type,
      folderId: folderId ? String(folderId) : undefined,
    });
    return { items };
  }

  // ✅ NEW: used by ChannelEditorPage to resolve thumbnail/url by mediaId
  @Get(":id")
  async getOne(@Param("id") id: string) {
    if (!id) throw new BadRequestException("Missing media id");
    const item = await this.media.getById(id); // we'll add this in service (tiny + safe)
    if (!item) throw new NotFoundException("Media not found");
    return { item };
  }

  @Get(":id/usage")
  async usage(@Param("id") id: string) {
    if (!id) throw new BadRequestException("Missing media id");
    return this.media.usage(id);
  }

  // ... keep everything else unchanged
}
