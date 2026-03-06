import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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

  // media.controller.ts

@Get()
async list(
  @Query("search") search?: string,
  @Query("type") type?: string,
  @Query("folderId") folderId?: string,
  @Query("includeFolders") includeFolders?: string,
) {
  const include = String(includeFolders ?? "").toLowerCase() === "true";

  const rawItems: any = await this.media.list({
    search,
    type,
    folderId: folderId ? String(folderId) : undefined,
  });

  // ✅ normalize to array
  const items: any[] =
    Array.isArray(rawItems) ? rawItems :
    Array.isArray(rawItems?.items) ? rawItems.items :
    Array.isArray(rawItems?.items?.items) ? rawItems.items.items :
    Array.isArray(rawItems?.data) ? rawItems.data :
    [];

  if (!include) return { items };

  const rawFolders: any = await this.media.listFolders({
    parentId: folderId ? String(folderId) : "root",
  });

  // ✅ normalize to array
  const folders: any[] =
    Array.isArray(rawFolders) ? rawFolders :
    Array.isArray(rawFolders?.items) ? rawFolders.items :
    Array.isArray(rawFolders?.folders) ? rawFolders.folders :
    [];

  return { items, folders };
}


  @Get(":id/usage")
  async usage(@Param("id") id: string) {
    if (!id) throw new BadRequestException("Missing media id");
    return this.media.usage(id);
  }
  

  @Post("usage")
  async usageBulk(@Body() body: { ids?: string[] }) {
    const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean).map(String) : [];
    if (ids.length === 0) throw new BadRequestException("Missing ids[]");
    return this.media.usageBulk(ids);
  }

  @Post(":id/move")
  async move(@Param("id") id: string, @Body() body: { folderId?: string | null }) {
    if (!id) throw new BadRequestException("Missing media id");
    return this.media.move(id, body?.folderId ?? null);
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    if (!id) throw new BadRequestException("Missing media id");
    return this.media.remove(id);
  }

  @Post("bulk-delete")
  async bulkDelete(@Body() body: { ids?: string[] }) {
    const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean).map(String) : [];
    if (ids.length === 0) throw new BadRequestException("Missing ids[]");
    return this.media.bulkDelete(ids);
  }

  @Post("upload")
  @UseInterceptors(FilesInterceptor("files"))
  async upload(
    @UploadedFiles() files: any[],
    @Query("folderId") folderId?: string,
    @Req() req?: any
  ) {
    // meta is optional; expected: [{ name: string, size: number, durationMs?: number }]
    let meta: Array<{ name: string; size: number; durationMs?: number }> = [];
    try {
      const raw = req?.body?.meta;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) meta = parsed;
      }
    } catch {
      meta = [];
    }

    const items = await this.media.createManyFromUploads(files || [], folderId ? String(folderId) : null, meta);
    return { items, count: items.length };
  }
}

