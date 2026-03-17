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
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { MediaService } from "./media.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentAuth } from "../auth/current-auth.decorator";
import type { AuthContext } from "../auth/interfaces/auth-context.interface";

@Controller("media")
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query("search") search?: string,
    @Query("type") type?: string,
    @Query("folderId") folderId?: string,
    @Query("includeFolders") includeFolders?: string,
  ) {
    const include = String(includeFolders ?? "").toLowerCase() === "true";

    const result = await this.media.list(auth, {
      search,
      type,
      folderId: folderId ? String(folderId) : undefined,
      includeFolders: include,
    });

    const items: any[] = Array.isArray(result?.items) ? result.items : [];
    const folders: any[] = Array.isArray(result?.folders) ? result.folders : [];

    if (!include) return { items };
    return { items, folders };
  }

  @Get(":id/usage")
  async usage(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    if (!id) throw new BadRequestException("Missing media id");
    return this.media.usage(auth, id);
  }

  @Post("usage")
  async usageBulk(
    @CurrentAuth() auth: AuthContext,
    @Body() body: { ids?: string[] },
  ) {
    const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean).map(String) : [];
    if (ids.length === 0) throw new BadRequestException("Missing ids[]");
    return this.media.usageBulk(auth, ids);
  }

  @Post(":id/move")
  async move(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: { folderId?: string | null },
  ) {
    if (!id) throw new BadRequestException("Missing media id");
    return this.media.move(auth, id, body?.folderId ?? null);
  }

  @Delete(":id")
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    if (!id) throw new BadRequestException("Missing media id");
    return this.media.remove(auth, id);
  }

  @Post("bulk-delete")
  async bulkDelete(
    @CurrentAuth() auth: AuthContext,
    @Body() body: { ids?: string[] },
  ) {
    const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean).map(String) : [];
    if (ids.length === 0) throw new BadRequestException("Missing ids[]");
    return this.media.bulkDelete(auth, ids);
  }

  @Post("upload")
  @UseInterceptors(FilesInterceptor("files"))
  async upload(
    @CurrentAuth() auth: AuthContext,
    @UploadedFiles() files: any[],
    @Query("folderId") folderId?: string,
    @Req() req?: any,
  ) {
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

    const items = await this.media.createManyFromUploads(
      auth,
      files || [],
      folderId ? String(folderId) : null,
      meta,
    );

    return { items, count: items.length };
  }
}