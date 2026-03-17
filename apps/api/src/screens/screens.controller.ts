import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ScreensService } from "./screens.service";
import { WsStateService } from "../ws/ws-state.service";
import { PairScreenDto } from "./dto/pair-screen.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentAuth } from "../auth/current-auth.decorator";
import type { AuthContext } from "../auth/interfaces/auth-context.interface";

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
  private readonly logger = new Logger(ScreensController.name);

  constructor(
    private readonly screens: ScreensService,
    private readonly wsState: WsStateService,
  ) {}

  @Get("runtime/:runtimeKey/manifest")
  async getRuntimeManifest(@Param("runtimeKey") runtimeKey: string) {
    return this.screens.getRuntimeManifestByRuntimeKey(runtimeKey);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@CurrentAuth() auth: AuthContext) {
    return this.screens.listScreens(auth);
  }

  @UseGuards(JwtAuthGuard)
  @Post("virtual-session")
  async createVirtualSession(@CurrentAuth() auth: AuthContext) {
    return this.screens.createVirtualSession(auth);
  }

  @UseGuards(JwtAuthGuard)
  @Get("virtual-session/:id")
  async getVirtualSession(@Param("id") id: string) {
    const s = await this.screens.getVirtualSessionByIdOrNull(id);
    if (!s || s.sessionType !== "VIRTUAL_SCREEN") {
      throw new NotFoundException("Virtual session not found");
    }
    return { id: s.id, code: s.pairingCode, expiresAt: s.expiresAt };
  }

  @UseGuards(JwtAuthGuard)
  @Get("virtual-session/:id/status")
  async getVirtualSessionStatus(@Param("id") id: string) {
    return this.screens.getVirtualSessionStatusByIdOrThrow(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/open-preview")
  async openPreview(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    return this.screens.openVirtualScreenPreview(auth, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/preview-session")
  async createPreviewSessionForScreen(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    return this.screens.createOrReusePreviewSessionForScreen(auth, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("pair")
  async pair(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PairScreenDto,
  ) {
    this.logger.log(
      `[pair] request received code=${dto?.code ?? ""} deviceId=${dto?.deviceId ?? ""} name=${dto?.name ?? ""}`,
    );

    try {
      const result = await this.screens.pairByCodeUpsert(
        dto.code,
        dto.deviceId,
        dto.name,
        auth,
      );

      this.logger.log(
        `[pair] success code=${dto?.code ?? ""} result=${JSON.stringify(result)}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `[pair] failed code=${dto?.code ?? ""} message=${error?.message ?? error}`,
        error?.stack,
      );
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id")
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: UpdateScreenDto,
  ) {
    return this.screens.updateScreenById(auth, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    return this.screens.deleteByIdAndReturnRuntimeKey(auth, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/unpair")
  async unpair(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    return this.screens.unpairScreen(auth, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/refresh")
  async refresh(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    const snap = await this.screens.getAdminScreenSnapshotById(auth, id);
    if (!snap) throw new NotFoundException("Screen not found");

    await this.wsState.pushScreenRefreshByScreenId(snap.id);
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/assign-content")
  async assignContent(
    @CurrentAuth() auth: AuthContext,
    @Param("id") screenId: string,
    @Body() dto: AssignContentDto,
  ) {
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

    return this.screens.assignContent(
      auth,
      screenId,
      type as "PLAYLIST" | "CHANNEL" | "MEDIA",
      idRaw,
    );
  }

  @Post("runtime/:runtimeKey/heartbeat")
  async heartbeat(@Param("runtimeKey") runtimeKey: string) {
    await this.screens.touchLastSeenByRuntimeKey(runtimeKey);
    return { ok: true };
  }

  @Get("runtime/:runtimeKey/state")
  async getRuntimeState(@Param("runtimeKey") runtimeKey: string) {
    return this.screens.getVirtualScreenStatePayloadByRuntimeKey(runtimeKey);
  }

  @Get("runtime/:runtimeKey/payload")
  async getRuntimePayload(@Param("runtimeKey") runtimeKey: string) {
    return this.screens.getVirtualScreenPlaylistPayloadByRuntimeKey(runtimeKey);
  }

  @Post("player/bootstrap")
  async playerBootstrap(
    @Body()
    body: {
      code?: string;
      deviceId?: string;
      name?: string;
      platform?: string;
      manufacturer?: string;
      model?: string;
      os?: string;
      sdk?: string;
      sw?: string;
      sh?: string;
      densityDpi?: string;
      ramMb?: string;
      storageTotalMb?: string;
      storageFreeMb?: string;
    },
  ) {
    this.logger.log(
      `[playerBootstrap] request received body=${JSON.stringify(body)}`,
    );

    try {
      const result = await this.screens.bootstrapPlayerSession(body);

      this.logger.log(
        `[playerBootstrap] success result=${JSON.stringify(result)}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `[playerBootstrap] failed message=${error?.message ?? error} body=${JSON.stringify(body)}`,
        error?.stack,
      );
      throw error;
    }
  }

  @Get("player/code/:code/status")
  async getPlayerCodeStatus(@Param("code") code: string) {
    this.logger.log(`[getPlayerCodeStatus] request received code=${code}`);

    try {
      const result = await this.screens.getPlayerCodeStatus(code);

      this.logger.log(
        `[getPlayerCodeStatus] success code=${code} result=${JSON.stringify(result)}`,
      );

      return result;
    } catch (error: any) {
      this.logger.error(
        `[getPlayerCodeStatus] failed code=${code} message=${error?.message ?? error}`,
        error?.stack,
      );
      throw error;
    }
  }

  @Get("debug-pair-route")
  debugPairRoute() {
    this.logger.log("[debugPairRoute] hit");
    return { ok: true, route: "screens/debug-pair-route" };
  }
}