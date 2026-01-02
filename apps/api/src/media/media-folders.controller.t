import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { MediaFoldersService, FolderNode } from "./media-folders.service";

@Controller("media/folders")
export class MediaFoldersController {
  constructor(private readonly folders: MediaFoldersService) {}

  @Get()
  async tree(): Promise<{ items: FolderNode[] }> {
    const items = await this.folders.listTree();
    return { items };
  }

  @Post()
  async create(@Body() body: { name?: string; parentId?: string | null }) {
    const row = await this.folders.create(body?.name ?? "", body?.parentId ?? null);
    return { ok: true, item: row };
  }

  @Patch(":id")
  async rename(@Param("id") id: string, @Body() body: { name?: string }) {
    const row = await this.folders.rename(id, body?.name ?? "");
    return { ok: true, item: row };
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    return this.folders.delete(id);
  }
}

