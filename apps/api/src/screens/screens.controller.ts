// apps/api/src/screens/screens.controller.ts

import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ScreensService } from "./screens.service";

type PairDto = { code: string };
type RenameDto = { name: string };

type AssignContentDto = {
  type: "channel" | "playlist" | "media" | "CHANNEL" | "PLAYLIST" | "MEDIA";
  id: string | null;
};

@Controller("screens")
export class ScreensController {
  constructor(private readonly screens: ScreensService) {}

  @Get()
  async list() {
    return this.screens.listScreensForAdmin();
  }

  @Post("virtual-session")
  async createVirtualSession() {
    return this.screens.createVirtualSession();
  }

  /**
   * ✅ NEW: resolve virtual session by opaque id (used by VirtualScreenPage)
   * GET /api/screens/virtual-session/:id
   */
  @Get("virtual-session/:id")
  async getVirtualSession(@Param("id") id: string) {
    const s = this.screens.getVirtualSessionByIdOrNull(id);
    if (!s) throw new NotFoundException("Virtual session not found");
    return { id: s.id, code: s.pairingCode };
  }

  @Post("pair")
  async pair(@Body() dto: PairDto) {
    return this.screens.pairByCodeUpsert(dto.code);
  }

  @Patch(":id")
  async rename(@Param("id") id: string, @Body() dto: RenameDto) {
    return this.screens.renameScreenById(id, dto.name);
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    return this.screens.deleteByIdAndReturnCode(id);
  }

  @Post(":id/refresh")
  async refresh(@Param("id") id: string) {
    const snap = await this.screens.getAdminScreenSnapshotById(id);
    if (!snap) throw new NotFoundException("Screen not found");
    return { ok: true };
  }

  /**
   * ✅ Generic assignment used by ScreenSetContentModal
   * Accepts BOTH lowercase and uppercase types to avoid mismatch.
   */
  @Post(":id/assign-content")
  async assignContent(@Param("id") screenId: string, @Body() dto: AssignContentDto) {
    const typeRaw = String(dto?.type ?? "").trim();
    const idRaw = dto?.id ? String(dto.id).trim() : null;

    if (!typeRaw || !idRaw) {
      throw new NotFoundException("Missing type or id");
    }

    const type =
      typeRaw.toLowerCase() === "playlist"
        ? "PLAYLIST"
        : typeRaw.toLowerCase() === "channel"
          ? "CHANNEL"
          : typeRaw.toLowerCase() === "media"
            ? "MEDIA"
            : typeRaw.toUpperCase();

    if (!["PLAYLIST", "CHANNEL", "MEDIA"].includes(type)) {
      throw new NotFoundException("Invalid type");
    }

    return this.screens.assignContent(screenId, type as any, idRaw);
  }
}
