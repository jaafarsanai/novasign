import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { MediaFoldersService, type FolderNode } from "./media-folders.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentAuth } from "../auth/current-auth.decorator";
import type { AuthContext } from "../auth/interfaces/auth-context.interface";

@Controller("media/folders")
@UseGuards(JwtAuthGuard)
export class MediaFoldersController {
  constructor(private readonly folders: MediaFoldersService) {}

  @Get()
  async tree(@CurrentAuth() auth: AuthContext): Promise<{ items: FolderNode[] }> {
    const items = await this.folders.listTree(auth);
    return { items };
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body()
    body: {
      name?: string;
      parentId?: string | null;
      visibilityScope?: "GLOBAL" | "WORKSPACE";
    },
  ) {
    const row = await this.folders.create(
      auth,
      body?.name ?? "",
      body?.parentId ?? null,
      body?.visibilityScope,
    );
    return { ok: true, item: row };
  }

  @Patch(":id")
  async rename(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: { name?: string },
  ) {
    const row = await this.folders.rename(auth, id, body?.name ?? "");
    return { ok: true, item: row };
  }

  @Post(":id/move")
  async move(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: { parentId?: string | null },
  ) {
    return this.folders.move(auth, id, body?.parentId ?? null);
  }

  @Delete(":id")
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.folders.delete(auth, id);
  }
}