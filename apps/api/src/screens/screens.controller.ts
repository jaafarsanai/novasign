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
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ScreensService } from "./screens.service";
import { WsStateService } from "../ws/ws-state.service";
import { PairScreenDto } from "./dto/pair-screen.dto"; // ✅ ADD

type UpdateScreenDto = {
  name?: string;
  orientation?: "LANDSCAPE" | "LANDSCAPE_FLIPPED" | "PORTRAIT" | "PORTRAIT_FLIPPED";
};

type AssignContentDto = {
  type: "channel" | "playlist" | "media" | "CHANNEL" | "PLAYLIST" | "MEDIA";
  id: string | null;
};

@Controller("screens")
export class ScreensController {
  constructor(
    private readonly screens: ScreensService,
    private readonly wsState: WsStateService,
    private readonly prisma: PrismaService
  ) {}

  @Get()
  async list() {
    return this.screens.listScreensForAdmin();
  }

  @Post("virtual-session")
  async createVirtualSession() {
    return this.screens.createVirtualSession();
  }

  @Get("virtual-session/:id")
  async getVirtualSession(@Param("id") id: string) {
    const s = await this.screens.getVirtualSessionByIdOrNull(id);
    if (!s) throw new NotFoundException("Virtual session not found");
    return { id: s.id, code: s.pairingCode };
  }

  @Post("pair")
  async pair(@Body() dto: PairScreenDto) {
    // ✅ supports: code-only (legacy) AND deviceId/name (optional)
    return this.screens.pairByCodeUpsert(dto.code, dto.deviceId, dto.name);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateScreenDto) {
    return this.screens.updateScreenById(id, dto);
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    return this.screens.deleteByIdAndReturnCode(id);
  }

  @Post(":id/refresh")
  async refresh(@Param("id") id: string) {
    const snap = await this.screens.getAdminScreenSnapshotById(id);
    if (!snap) throw new NotFoundException("Screen not found");

    await this.wsState.pushVirtualScreenRefresh(snap.pairingCode);
    return { ok: true };
  }

  @Post(":id/assign-content")
  async assignContent(@Param("id") screenId: string, @Body() dto: AssignContentDto) {
    const typeRaw = String(dto?.type ?? "").trim();
    const idRaw = dto?.id ? String(dto.id).trim() : null;

    if (!typeRaw || !idRaw) throw new NotFoundException("Missing type or id");

    const type =
      typeRaw.toLowerCase() === "playlist"
        ? "PLAYLIST"
        : typeRaw.toLowerCase() === "channel"
        ? "CHANNEL"
        : typeRaw.toLowerCase() === "media"
        ? "MEDIA"
        : typeRaw.toUpperCase();

    if (!["PLAYLIST", "CHANNEL", "MEDIA"].includes(type)) throw new NotFoundException("Invalid type");

    return this.screens.assignContent(screenId, type as any, idRaw);
  }

  // (you can keep your device/register endpoint if you want, but it’s no longer required)
}