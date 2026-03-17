import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthContext } from "../auth/interfaces/auth-context.interface";
import { isOrgAdmin } from "../auth/role-helpers";
import {
  getZonedParts,
  safeTimezone,
  weekdayToScheduleDay,
  zonedSecondsOfDay,
} from "../common/timezone.util";
import crypto from "node:crypto";

function makeCode6() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

type AdminScreenRow = {
  id: string;
  name: string | null;
  runtimeKey: string;
  pairedAt: string | null;
  lastSeenAt: string | null;
  isVirtual: boolean;

  assignedPlaylistId: string | null;
  assignedPlaylistName: string | null;

  assignedContentType: "PLAYLIST" | "CHANNEL" | "MEDIA" | null;
  assignedContentId: string | null;
  assignedContentName: string | null;

  virtualSessionId: string | null;
  activePairingCode: string | null;
  orientation: any;
  status: any;
};

type VSState = "PAIR" | "WAITING" | "PLAYING" | "UNKNOWN";

export type VsStatePayload = {
  runtimeKey: string;
  state: VSState;
  updatedAt: number;
  playlistAssigned: boolean;
  exists: boolean;
  screenId: string | null;
  isVirtual: boolean;
  orientation: any;
};

type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

type ScheduleTimeWindow = {
  id: string;
  startTime: string;
  endTime: string;
};

type ZoneItemSchedule = {
  id: string;
  mode: "everyday" | "weekly";
  weeklyDays: Weekday[];
  dateOnlyEnabled: boolean;
  dateStart: string | null;
  dateEnd: string | null;
  timeWindows: ScheduleTimeWindow[];
  playInFullScreen: boolean;
  priority: boolean;
};

export type VsPlaylistItem = {
  id: string;
  type: "image" | "video";
  url: string;
  order: number;
  durationMs?: number;
  schedule?: ZoneItemSchedule | null;
  schedules?: ZoneItemSchedule[];
  transitionType?: string;
  transitionMs?: number;
};

export type VsPlaylistPayload = {
  runtimeKey: string;
  playlistId: string | null;
  updatedAt: number;
  items: VsPlaylistItem[];
  channel?: {
    channelId: string;
    layoutId: string | null;
    orientation?: "landscape" | "portrait";
    zones: Record<string, VsPlaylistItem[]>;
    transition?: any;
  };
};

function screenBaseOrientation(o: any): "landscape" | "portrait" {
  const s = String(o ?? "LANDSCAPE").toUpperCase();
  return s.startsWith("PORTRAIT") ? "portrait" : "landscape";
}

function normalizeMediaType(raw: unknown): "image" | "video" {
  const t = String(raw ?? "").toLowerCase();
  return t === "video" ? "video" : "image";
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYmdInTimezone(d: Date, timeZone: string) {
  return getZonedParts(d, timeZone).ymd;
}

function weekdayOfInTimezone(d: Date, timeZone: string): Weekday {
  return weekdayToScheduleDay(getZonedParts(d, timeZone).weekdayShort);
}

function nowSecOfDayInTimezone(d: Date, timeZone: string) {
  return zonedSecondsOfDay(d, timeZone);
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

function computeDurationMs(args: {
  type: "image" | "video";
  json?: any;
  media?: { durationMs?: number | null };
}): number | undefined {
  const { type, json, media } = args;

  const jsonMs =
    typeof json?.durationMs === "number" && Number.isFinite(json.durationMs)
      ? json.durationMs
      : undefined;

  const jsonSec =
    typeof json?.durationSec === "number" && Number.isFinite(json.durationSec)
      ? json.durationSec
      : undefined;

  const dbMs =
    typeof media?.durationMs === "number" && Number.isFinite(media.durationMs)
      ? media.durationMs
      : undefined;

  if (type === "image") {
    if (typeof jsonMs === "number" && jsonMs >= 500) return jsonMs;
    if (typeof jsonSec === "number" && jsonSec > 0) return Math.max(500, Math.floor(jsonSec * 1000));
    if (typeof dbMs === "number" && dbMs >= 500) return dbMs;
    return 5000;
  }

  if (typeof jsonMs === "number" && jsonMs >= 1000) return jsonMs;
  if (typeof dbMs === "number" && dbMs >= 1000) return dbMs;

  return undefined;
}

function normalizeTime(raw: string) {
  const s = String(raw ?? "").trim();
  if (!s) return "00:00:00";

  const upper = s.toUpperCase();
  const hasAM = upper.endsWith("AM");
  const hasPM = upper.endsWith("PM");
  const ampm = hasAM ? "AM" : hasPM ? "PM" : null;

  const core = ampm ? upper.replace(/\s*(AM|PM)\s*$/, "").trim() : upper;
  const parts = core.split(":").map((x) => x.trim());
  if (parts.length < 2) return "00:00:00";

  let hh = clampInt(Number(parts[0] || 0), 0, 23);
  const mm = clampInt(Number(parts[1] || 0), 0, 59);
  const ss = clampInt(Number(parts[2] || 0), 0, 59);

  if (ampm) {
    hh = clampInt(hh, 1, 12);
    if (ampm === "AM") hh = hh === 12 ? 0 : hh;
    else hh = hh === 12 ? 12 : hh + 12;
  }

  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

function timeToSec(hms: string) {
  const norm = normalizeTime(hms);
  const [h, m, s] = norm.split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

function ensureSchedulesFromItem(it: any): ZoneItemSchedule[] {
  if (Array.isArray(it?.schedules) && it.schedules.length) return it.schedules as ZoneItemSchedule[];
  if (it?.schedule) return [it.schedule as ZoneItemSchedule];
  return [];
}

function isScheduleActive(s: ZoneItemSchedule, now: Date, timeZone: string) {
  const ymd = toYmdInTimezone(now, timeZone);

  if (s.dateOnlyEnabled) {
    if (!s.dateStart || !s.dateEnd) return false;
  }
  if (s.dateStart && ymd < s.dateStart) return false;
  if (s.dateEnd && ymd > s.dateEnd) return false;

  if (s.mode === "weekly") {
    const wd = weekdayOfInTimezone(now, timeZone);
    const days: Weekday[] =
      s.weeklyDays?.length
        ? (s.weeklyDays as Weekday[])
        : (["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as Weekday[]);
    if (!days.includes(wd)) return false;
  }

  if (!s.timeWindows || s.timeWindows.length === 0) return true;

  const t = nowSecOfDayInTimezone(now, timeZone);
  return s.timeWindows.some((w) => {
    const a = timeToSec(w.startTime);
    const b = timeToSec(w.endTime);
    return t >= a && t <= b;
  });
}

@Injectable()
export class ScreensService {
  constructor(private readonly prisma: PrismaService) {}

  private normCode(code: any) {
    return String(code || "").trim().toUpperCase();
  }

  private normRuntimeKey(value: any) {
    return String(value || "").trim();
  }

  private requireActiveWorkspaceId(auth: AuthContext): string {
    if (!auth.activeWorkspaceId) {
      throw new BadRequestException("No active workspace selected");
    }
    return auth.activeWorkspaceId;
  }

  private async expireOldPairingSessions() {
    await this.prisma.pairingSession.updateMany({
      where: {
        status: "OPEN",
        expiresAt: { lt: new Date() },
      },
      data: {
        status: "EXPIRED",
      },
    });
  }

  private async assertOrganizationHasAvailableScreenSlot(organizationId: string) {
    const now = new Date();

    const activeLicenses = await this.prisma.license.findMany({
      where: {
        organizationId,
        status: { in: ["ACTIVE", "TRIAL"] },
        startsAt: { lte: now },
        expiresAt: { gte: now },
      },
      select: { screenQuota: true },
    });

    const totalQuota = activeLicenses.reduce((sum, item) => sum + (item.screenQuota ?? 0), 0);

    const used = await this.prisma.screen.count({
      where: {
        organizationId,
        pairedAt: { not: null },
        isArchived: false,
      },
    });

    if (used >= totalQuota) {
      throw new ForbiddenException(
        `Screen quota reached. Used ${used}/${totalQuota}. Please unpair a screen or upgrade your license.`,
      );
    }
  }

  private async generateUniquePairingCode() {
    for (let i = 0; i < 50; i++) {
      const pairingCode = makeCode6();

      const existingSession = await this.prisma.pairingSession.findUnique({
        where: { pairingCode },
        select: { id: true, status: true, expiresAt: true },
      });

      if (!existingSession) return pairingCode;

      const reusable =
        existingSession.status !== "OPEN" ||
        existingSession.expiresAt.getTime() < Date.now();

      if (reusable) return pairingCode;
    }

    throw new BadRequestException("Unable to generate a unique pairing code");
  }

  private async getScopedScreenOrThrow(auth: AuthContext, screenId: string) {
    const screen = await this.prisma.screen.findUnique({
      where: { id: screenId },
      select: {
        id: true,
        organizationId: true,
        workspaceId: true,
        runtimeKey: true,
        assignedPlaylistId: true,
        assignedContentType: true,
        assignedContentId: true,
        orientation: true,
        isVirtual: true,
        pairedAt: true,
        lastSeenAt: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        pairingSessions: {
  where: {
    status: "OPEN",
    sessionType: { in: ["VIRTUAL_SCREEN", "DEVICE"] },
  },
  orderBy: { createdAt: "desc" },
  select: {
    id: true,
    pairingCode: true,
    sessionType: true,
    deviceId: true,
    screenId: true,
  },
},
      },
    });

    if (!screen || screen.organizationId !== auth.organizationId) {
      throw new NotFoundException("Screen not found");
    }

    if (!isOrgAdmin(auth) && screen.workspaceId !== auth.activeWorkspaceId) {
      throw new ForbiddenException("Screen is outside active workspace");
    }

    return screen;
  }

  async getVirtualSessionStatusByIdOrThrow(sessionId: string) {
    const id = String(sessionId || "").trim();
    if (!id) {
      throw new NotFoundException("Virtual session not found");
    }

    await this.expireOldPairingSessions();

    const session = await this.prisma.pairingSession.findUnique({
      where: { id },
      select: {
        id: true,
        pairingCode: true,
        sessionType: true,
        status: true,
        expiresAt: true,
        claimedAt: true,
        screenId: true,
        metadata: true,
        screen: {
          select: {
            id: true,
            runtimeKey: true,
            status: true,
            pairedAt: true,
            isVirtual: true,
            name: true,
          },
        },
      },
    });

    if (!session || session.sessionType !== "VIRTUAL_SCREEN") {
      throw new NotFoundException("Virtual session not found");
    }

    return {
      id: session.id,
      sessionType: session.sessionType,
      status: session.status,
      code: session.pairingCode,
      expiresAt: session.expiresAt,
      claimedAt: session.claimedAt ?? null,
      screenId: session.screenId ?? session.screen?.id ?? null,
      runtimeKey: session.screen?.runtimeKey ?? null,
      screenStatus: session.screen?.status ?? null,
      pairedAt: session.screen?.pairedAt ?? null,
      isVirtual: session.screen?.isVirtual ?? true,
      screenName: session.screen?.name ?? null,
      metadata: session.metadata ?? null,
    };
  }

async createOrReusePreviewSessionForScreen(auth: AuthContext, screenId: string) {
  await this.expireOldPairingSessions();

  const screen = await this.getScopedScreenOrThrow(auth, screenId);

  if (!screen.isVirtual) {
    throw new BadRequestException("Preview session is supported only for virtual screens");
  }

  if (!screen.workspaceId) {
    throw new BadRequestException("Virtual screen has no workspace");
  }

  const existingOpen = await this.prisma.pairingSession.findFirst({
    where: {
      screenId: screen.id,
      sessionType: "VIRTUAL_SCREEN",
      status: "OPEN",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      pairingCode: true,
      expiresAt: true,
    },
  });

  if (existingOpen) {
    return {
      id: existingOpen.id,
      code: existingOpen.pairingCode,
      expiresAt: existingOpen.expiresAt,
    };
  }

  await this.prisma.pairingSession.updateMany({
    where: {
      screenId: screen.id,
      sessionType: "VIRTUAL_SCREEN",
      status: "OPEN",
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: "replaced-by-new-preview-session",
    },
  });

  const pairingCode = await this.generateUniquePairingCode();
  const expiresAt = addMinutes(new Date(), 10);

  const session = await this.prisma.pairingSession.create({
    data: {
      pairingCode,
      sessionType: "VIRTUAL_SCREEN",
      status: "OPEN",
      organizationId: screen.organizationId,
      workspaceId: screen.workspaceId,
      createdByUserId: auth.userId,
      screenId: screen.id,
      expiresAt,
      metadata: {
        source: "screen-preview",
        screenId: screen.id,
      },
    },
    select: {
      id: true,
      pairingCode: true,
      expiresAt: true,
    },
  });

  return {
    id: session.id,
    code: session.pairingCode,
    expiresAt: session.expiresAt,
  };
}

async openVirtualScreenPreview(auth: AuthContext, screenId: string) {
  const screen = await this.getScopedScreenOrThrow(auth, screenId);

  if (!screen.isVirtual) {
    throw new BadRequestException("Preview reopening is only supported for virtual screens");
  }

  if (!screen.runtimeKey) {
    throw new BadRequestException("Virtual screen has no runtime key");
  }

  return {
    screenId: screen.id,
    runtimeKey: screen.runtimeKey,
    previewUrl: `/virtual-screen/runtime/${screen.runtimeKey}`,
  };
}

  async createVirtualSession(auth: AuthContext) {
    await this.expireOldPairingSessions();

    const workspaceId = this.requireActiveWorkspaceId(auth);
    const pairingCode = await this.generateUniquePairingCode();
    const expiresAt = addMinutes(new Date(), 10);

    const session = await this.prisma.pairingSession.create({
      data: {
        pairingCode,
        sessionType: "VIRTUAL_SCREEN",
        status: "OPEN",
        organizationId: auth.organizationId,
        workspaceId,
        createdByUserId: auth.userId,
        expiresAt,
        metadata: {
          source: "admin-launch-virtual-screen",
        },
      },
      select: {
        id: true,
        pairingCode: true,
        expiresAt: true,
      },
    });

    return {
      id: session.id,
      code: session.pairingCode,
      expiresAt: session.expiresAt,
    };
  }

  async updateScreenById(
    auth: AuthContext,
    id: string,
    dto: {
      name?: string;
      orientation?: "LANDSCAPE" | "LANDSCAPE_FLIPPED" | "PORTRAIT" | "PORTRAIT_FLIPPED";
    },
  ) {
    const existing = await this.getScopedScreenOrThrow(auth, id);

    if (dto.orientation) {
      const effectiveType =
        (existing.assignedContentType as any) ?? (existing.assignedPlaylistId ? "PLAYLIST" : null);
      const effectiveId = (existing.assignedContentId as any) ?? (existing.assignedPlaylistId ?? null);

      if (effectiveType === "CHANNEL" && effectiveId) {
        const ch = await this.prisma.channel.findUnique({
          where: { id: String(effectiveId) as any },
          select: { id: true, orientation: true, organizationId: true, workspaceId: true, isArchived: true },
        });

        if (!ch || ch.organizationId !== auth.organizationId || ch.isArchived) {
          throw new NotFoundException("Channel not found");
        }

        if (!isOrgAdmin(auth) && ch.workspaceId !== auth.activeWorkspaceId) {
          throw new ForbiddenException("Channel is outside active workspace");
        }

        const so = screenBaseOrientation(dto.orientation);
        const co = String(ch.orientation ?? "landscape");
        if (so !== co) {
          throw new BadRequestException(
            `Channel orientation (${co}) does not match screen orientation (${so}).`,
          );
        }
      }
    }

    const data: any = {};
    if (dto.name != null) data.name = String(dto.name);
    if (dto.orientation != null) data.orientation = dto.orientation;

    try {
      return await this.prisma.screen.update({
        where: { id },
        data,
      });
    } catch (e: any) {
      if (e?.code === "P2025") throw new NotFoundException("Screen not found");
      throw e;
    }
  }

  async getByRuntimeKeyOrNull(runtimeKey: string) {
    const key = this.normRuntimeKey(runtimeKey);
    if (!key) return null;

    return this.prisma.screen.findUnique({
      where: { runtimeKey: key },
      include: { assignedPlaylist: true },
    });
  }

  async touchLastSeenById(screenId: string) {
    await this.prisma.$executeRaw`
      UPDATE "Screen"
      SET "lastSeenAt" = NOW()
      WHERE "id" = ${screenId}
    `;
  }
  async bootstrapPlayerSession(input: {
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
}) {
  await this.expireOldPairingSessions();

  const pairingCode = this.normCode(String(input.code ?? ""));
  if (!pairingCode || pairingCode.length !== 6) {
    throw new BadRequestException("Invalid pairing code");
  }

  const deviceId = String(input.deviceId ?? "").trim() || null;
  const now = new Date();
  const expiresAt = addMinutes(now, 10);

  const metadata = {
    source: "android-player-bootstrap",
    role: "device",
    name: String(input.name ?? "").trim() || "Android Player",
    platform: String(input.platform ?? "").trim() || "android",
    manufacturer: String(input.manufacturer ?? "").trim() || null,
    model: String(input.model ?? "").trim() || null,
    os: String(input.os ?? "").trim() || null,
    sdk: String(input.sdk ?? "").trim() || null,
    sw: String(input.sw ?? "").trim() || null,
    sh: String(input.sh ?? "").trim() || null,
    densityDpi: String(input.densityDpi ?? "").trim() || null,
    ramMb: String(input.ramMb ?? "").trim() || null,
    storageTotalMb: String(input.storageTotalMb ?? "").trim() || null,
    storageFreeMb: String(input.storageFreeMb ?? "").trim() || null,
    bootstrappedAt: now.toISOString(),
  };

  const existingOpen = await this.prisma.pairingSession.findUnique({
    where: { pairingCode },
    select: {
      id: true,
      pairingCode: true,
      sessionType: true,
      status: true,
      expiresAt: true,
      organizationId: true,
      workspaceId: true,
      screenId: true,
      deviceId: true,
      metadata: true,
    },
  });

 if (existingOpen) {
  if (existingOpen.sessionType === "DEVICE") {
    const reopened = await this.prisma.pairingSession.update({
      where: { id: existingOpen.id },
      data: {
        status: "OPEN",
        expiresAt,
        deviceId,
        metadata,
        claimedAt: null,
        claimedByUserId: null,
        cancelledAt: null,
        cancelReason: null,
        screenId: null,
        organizationId: null,
        workspaceId: null,
      },
      select: {
        id: true,
        pairingCode: true,
        expiresAt: true,
        sessionType: true,
        status: true,
      },
    });

    return {
      ok: true,
      id: reopened.id,
      code: reopened.pairingCode,
      expiresAt: reopened.expiresAt,
      sessionType: reopened.sessionType,
      status: reopened.status,
    };
  }

  throw new BadRequestException("Pairing code is already in use");
}

  const session = await this.prisma.pairingSession.create({
    data: {
      pairingCode,
      sessionType: "DEVICE",
      status: "OPEN",
      organizationId: null,
      workspaceId: null,
      createdByUserId: null,
      screenId: null,
      deviceId,
      expiresAt,
      metadata,
    },
    select: {
      id: true,
      pairingCode: true,
      expiresAt: true,
      sessionType: true,
      status: true,
    },
  });

  return {
    ok: true,
    id: session.id,
    code: session.pairingCode,
    expiresAt: session.expiresAt,
    sessionType: session.sessionType,
    status: session.status,
  };
}
async getPlayerCodeStatus(rawCode: string) {
  const pairingCode = this.normCode(rawCode);

  if (!pairingCode || pairingCode.length !== 6) {
    return {
      code: pairingCode || "",
      found: false,
      status: "INVALID",
      claimed: false,
      runtimeKey: null,
      screenId: null,
      isVirtual: false,
      orientation: "LANDSCAPE",
    };
  }

  await this.expireOldPairingSessions();

  const session = await this.prisma.pairingSession.findUnique({
    where: { pairingCode },
    select: {
      id: true,
      pairingCode: true,
      sessionType: true,
      status: true,
      expiresAt: true,
      screenId: true,
      screen: {
        select: {
          id: true,
          runtimeKey: true,
          isVirtual: true,
          orientation: true,
          status: true,
        },
      },
    },
  });

  if (!session) {
    return {
      code: pairingCode,
      found: false,
      status: "OPEN",
      claimed: false,
      runtimeKey: null,
      screenId: null,
      isVirtual: false,
      orientation: "LANDSCAPE",
    };
  }

  const expired = session.expiresAt.getTime() < Date.now();

  if (session.status === "CLAIMED" && session.screen?.runtimeKey) {
    return {
      code: pairingCode,
      found: true,
      status: "CLAIMED",
      claimed: true,
      runtimeKey: session.screen.runtimeKey,
      screenId: session.screen.id,
      isVirtual: !!session.screen.isVirtual,
      orientation: session.screen.orientation ?? "LANDSCAPE",
    };
  }

  if (expired || session.status === "EXPIRED") {
    return {
      code: pairingCode,
      found: true,
      status: "EXPIRED",
      claimed: false,
      runtimeKey: null,
      screenId: session.screenId ?? null,
      isVirtual: false,
      orientation: "LANDSCAPE",
    };
  }

  if (session.status === "CANCELLED") {
    return {
      code: pairingCode,
      found: true,
      status: "CANCELLED",
      claimed: false,
      runtimeKey: null,
      screenId: session.screenId ?? null,
      isVirtual: false,
      orientation: "LANDSCAPE",
    };
  }

  return {
    code: pairingCode,
    found: true,
    status: "OPEN",
    claimed: false,
    runtimeKey: null,
    screenId: session.screenId ?? null,
    isVirtual: false,
    orientation: "LANDSCAPE",
  };
}

  async getRuntimeManifestByRuntimeKey(runtimeKey: string) {
    const state = await this.getVirtualScreenStatePayloadByRuntimeKey(runtimeKey);
    const playlist = await this.getVirtualScreenPlaylistPayloadByRuntimeKey(runtimeKey);

    const assetsMap = new Map<
      string,
      { id: string; url: string; checksum?: string; mimeType?: string; updatedAt?: number }
    >();

    const collect = (id: string, url: string) => {
      const key = String(id || url);
      if (!key || !url) return;
      if (!assetsMap.has(key)) {
        assetsMap.set(key, {
          id: key,
          url: String(url),
        });
      }
    };

    for (const item of playlist.items ?? []) {
      collect(item.id, item.url);
    }

    const zones = playlist.channel?.zones ?? {};
    for (const value of Object.values(zones)) {
      const arr = Array.isArray(value) ? value : [];
      for (const item of arr as any[]) {
        if (item?.id && item?.url) {
          collect(String(item.id), String(item.url));
        }
      }
    }

    return {
      runtimeKey,
      screenId: state.screenId ?? "",
      updatedAt: Math.max(Number(state.updatedAt ?? 0), Number(playlist.updatedAt ?? 0)),
      state,
      playlist,
      assets: Array.from(assetsMap.values()),
    };
  }

  async touchLastSeenByRuntimeKey(runtimeKey: string) {
    const key = this.normRuntimeKey(runtimeKey);
    if (!key) return;

    const s = await this.prisma.screen.findUnique({
      where: { runtimeKey: key },
      select: { id: true },
    });

    if (!s) return;
    await this.touchLastSeenById(s.id);
  }

  async getVirtualSessionStatusOrThrow(auth: AuthContext, sessionId: string) {
    const id = String(sessionId || "").trim();
    if (!id) {
      throw new NotFoundException("Virtual session not found");
    }

    await this.expireOldPairingSessions();

    const session = await this.prisma.pairingSession.findUnique({
      where: { id },
      select: {
        id: true,
        pairingCode: true,
        sessionType: true,
        status: true,
        organizationId: true,
        workspaceId: true,
        createdByUserId: true,
        expiresAt: true,
        claimedAt: true,
        claimedByUserId: true,
        screenId: true,
        metadata: true,
        screen: {
          select: {
            id: true,
            runtimeKey: true,
            status: true,
            pairedAt: true,
            isVirtual: true,
            name: true,
            organizationId: true,
            workspaceId: true,
          },
        },
      },
    });

    if (!session || session.sessionType !== "VIRTUAL_SCREEN") {
      throw new NotFoundException("Virtual session not found");
    }

    if (session.organizationId !== auth.organizationId) {
      throw new ForbiddenException("Virtual session belongs to another organization");
    }

    if (!isOrgAdmin(auth) && session.workspaceId !== auth.activeWorkspaceId) {
      throw new ForbiddenException("Virtual session is outside active workspace");
    }

    return {
      id: session.id,
      sessionType: session.sessionType,
      status: session.status,
      code: session.pairingCode,
      expiresAt: session.expiresAt,
      claimedAt: session.claimedAt ?? null,
      screenId: session.screen?.id ?? session.screenId ?? null,
      runtimeKey: session.screen?.runtimeKey ?? null,
      screenStatus: session.screen?.status ?? null,
      pairedAt: session.screen?.pairedAt ?? null,
      isVirtual: session.screen?.isVirtual ?? true,
      screenName: session.screen?.name ?? null,
      metadata: session.metadata ?? null,
    };
  }

  async getVirtualSessionByIdOrNull(sessionId: string) {
    const id = String(sessionId || "").trim();
    if (!id) return null;

    await this.expireOldPairingSessions();

    return this.prisma.pairingSession.findUnique({
      where: { id },
      select: {
        id: true,
        pairingCode: true,
        organizationId: true,
        workspaceId: true,
        createdByUserId: true,
        expiresAt: true,
        status: true,
        sessionType: true,
      },
    });
  }

  async listScreens(auth: AuthContext): Promise<AdminScreenRow[]> {
  const where = isOrgAdmin(auth)
    ? {
        organizationId: auth.organizationId,
        isArchived: false,
      }
    : {
        organizationId: auth.organizationId,
        workspaceId: this.requireActiveWorkspaceId(auth),
        isArchived: false,
      };

  const rows = await this.prisma.screen.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      assignedPlaylist: true,
      pairingSessions: {
        where: {
          status: "OPEN",
          sessionType: { in: ["VIRTUAL_SCREEN", "DEVICE"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          pairingCode: true,
          sessionType: true,
          screenId: true,
          deviceId: true,
          expiresAt: true,
        },
      },
    },
  });

  return Promise.all(
    rows.map(async (s): Promise<AdminScreenRow> => {
      const assignedContentType =
        (s.assignedContentType as any) ?? (s.assignedPlaylistId ? "PLAYLIST" : null);

      const assignedContentId =
        (s.assignedContentId as any) ?? (s.assignedPlaylistId ?? null);

      const assignedContentName = await this.resolveAssignedContentName(
        assignedContentType,
        assignedContentId,
      );

      const latestOpenVirtual =
        s.pairingSessions?.find((x) => x.sessionType === "VIRTUAL_SCREEN") ?? null;

      const latestOpenDevice =
        s.pairingSessions?.find((x) => x.sessionType === "DEVICE") ?? null;

      const activePairingCode = s.isVirtual
        ? latestOpenVirtual?.pairingCode ?? null
        : latestOpenDevice?.pairingCode ?? null;

      const virtualSessionId = s.isVirtual
        ? latestOpenVirtual?.id ?? null
        : null;

      return {
        id: s.id,
        name: s.name,
        runtimeKey: s.runtimeKey,
        pairedAt: s.pairedAt ? s.pairedAt.toISOString() : null,
        lastSeenAt: s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
        isVirtual: !!s.isVirtual,
        assignedPlaylistId: s.assignedPlaylistId ?? null,
        assignedPlaylistName: s.assignedPlaylist?.name ?? null,
        assignedContentType,
        assignedContentId,
        assignedContentName,
        virtualSessionId,
        activePairingCode,
        orientation: (s as any).orientation ?? "LANDSCAPE",
        status: (s as any).status ?? "PENDING",
      };
    }),
  );
}

  async pairByCodeUpsert(
    rawCode: string,
    deviceId?: string,
    name?: string,
    auth?: AuthContext,
  ) {
    const pairingCode = this.normCode(rawCode);

    if (!pairingCode || pairingCode.length !== 6) {
      throw new NotFoundException("Invalid pairing code");
    }

    if (!auth?.organizationId || !auth?.activeWorkspaceId || !auth?.userId) {
      throw new BadRequestException("Missing auth organization/workspace context");
    }

    await this.expireOldPairingSessions();

    const session = await this.prisma.pairingSession.findUnique({
      where: { pairingCode },
      select: {
        id: true,
        pairingCode: true,
        sessionType: true,
        status: true,
        organizationId: true,
        workspaceId: true,
        expiresAt: true,
        screenId: true,
      },
    });

    if (!session) {
  const effectiveDeviceId = deviceId?.trim() || null;

  if (!effectiveDeviceId) {
    throw new NotFoundException("Pairing session not found");
  }

  await this.assertOrganizationHasAvailableScreenSlot(auth.organizationId);

  const existingById = await this.prisma.screen.findUnique({
    where: { id: effectiveDeviceId },
    select: {
      id: true,
      organizationId: true,
      workspaceId: true,
      name: true,
      runtimeKey: true,
      isVirtual: true,
      status: true,
      orientation: true,
    },
  }).catch(() => null);

  let screen:
    | {
        id: string;
        runtimeKey: string;
        name: string | null;
        pairedAt: Date | null;
        isVirtual: boolean;
        workspaceId: string | null;
        organizationId: string;
        status: any;
      }
    | null = null;

  if (existingById) {
    if (existingById.organizationId !== auth.organizationId) {
      throw new ForbiddenException("Screen belongs to another organization");
    }

    if (!isOrgAdmin(auth) && existingById.workspaceId !== auth.activeWorkspaceId) {
      throw new ForbiddenException("Screen is outside active workspace");
    }

    screen = await this.prisma.screen.update({
      where: { id: existingById.id },
      data: {
        pairedAt: new Date(),
        isVirtual: false,
        name: name?.trim() || existingById.name || "Android Player",
        status: "PAIRED",
      },
      select: {
        id: true,
        runtimeKey: true,
        name: true,
        pairedAt: true,
        isVirtual: true,
        workspaceId: true,
        organizationId: true,
        status: true,
      },
    });
  } else {
    screen = await this.prisma.screen.create({
      data: {
        id: effectiveDeviceId,
        name: name?.trim() || "Android Player",
        pairedAt: new Date(),
        lastSeenAt: null,
        assignedPlaylistId: null,
        assignedContentType: null,
        assignedContentId: null,
        isVirtual: false,
        isArchived: false,
        status: "PAIRED",
        organizationId: auth.organizationId,
        workspaceId: auth.activeWorkspaceId,
        createdByUserId: auth.userId,
      },
      select: {
        id: true,
        runtimeKey: true,
        name: true,
        pairedAt: true,
        isVirtual: true,
        workspaceId: true,
        organizationId: true,
        status: true,
      },
    });
  }

  if (!screen) {
  throw new BadRequestException("Failed to create or update screen");
}

  await this.prisma.pairingSession.create({
    data: {
      pairingCode,
      sessionType: "DEVICE",
      status: "CLAIMED",
      organizationId: auth.organizationId,
      workspaceId: auth.activeWorkspaceId,
      createdByUserId: auth.userId,
      claimedByUserId: auth.userId,
      claimedAt: new Date(),
      expiresAt: addMinutes(new Date(), 10),
      screenId: screen.id,
      deviceId: effectiveDeviceId,
      metadata: {
        source: "admin-pair-direct-device-code",
      },
    },
  });

  return {
    ...screen,
    pairingCode: null,
  };
}



if (session.sessionType !== "DEVICE") {
  if (session.organizationId !== auth.organizationId) {
    throw new ForbiddenException("Pairing code belongs to another organization");
  }

  if (!isOrgAdmin(auth) && session.workspaceId !== auth.activeWorkspaceId) {
    throw new ForbiddenException("Pairing code is outside active workspace");
  }
}

    if (session.screenId) {
      const existingLinked = await this.prisma.screen.findUnique({
        where: { id: session.screenId },
        select: {
          id: true,
          organizationId: true,
          workspaceId: true,
          isVirtual: true,
          name: true,
          runtimeKey: true,
        },
      });

      if (!existingLinked) {
        throw new NotFoundException("Linked screen not found");
      }

      if (existingLinked.organizationId !== auth.organizationId) {
        throw new ForbiddenException("Screen belongs to another organization");
      }

      if (!isOrgAdmin(auth) && existingLinked.workspaceId !== auth.activeWorkspaceId) {
        throw new ForbiddenException("Screen is outside active workspace");
      }

      const updated = await this.prisma.screen.update({
        where: { id: existingLinked.id },
        data: {
          pairedAt: new Date(),
          isVirtual: session.sessionType === "VIRTUAL_SCREEN",
          name: name?.trim() || existingLinked.name,
          status: "PAIRED",
        },
        select: {
          id: true,
          runtimeKey: true,
          name: true,
          pairedAt: true,
          isVirtual: true,
          workspaceId: true,
          organizationId: true,
          status: true,
        },
      });

      await this.prisma.pairingSession.update({
        where: { id: session.id },
        data: {
          status: "CLAIMED",
          claimedAt: new Date(),
          claimedByUserId: auth.userId,
          organizationId: auth.organizationId,
          workspaceId: auth.activeWorkspaceId,
          screenId: updated.id,
          deviceId: deviceId?.trim() || null,
        },
      });

      return {
        ...updated,
        pairingCode: null,
      };
    }

    await this.assertOrganizationHasAvailableScreenSlot(auth.organizationId);

    if (deviceId && String(deviceId).trim()) {
      const id = String(deviceId).trim();

      const existingById = await this.prisma.screen.findUnique({
        where: { id },
        select: {
          id: true,
          organizationId: true,
          workspaceId: true,
          name: true,
          runtimeKey: true,
        },
      }).catch(() => null);

      if (existingById) {
        if (existingById.organizationId !== auth.organizationId) {
          throw new ForbiddenException("Screen belongs to another organization");
        }

        if (!isOrgAdmin(auth) && existingById.workspaceId !== auth.activeWorkspaceId) {
          throw new ForbiddenException("Screen is outside active workspace");
        }

        const updated = await this.prisma.screen.update({
          where: { id },
          data: {
            pairedAt: new Date(),
            isVirtual: session.sessionType === "VIRTUAL_SCREEN",
            name: name?.trim() || existingById.name,
            status: "PAIRED",
          },
          select: {
            id: true,
            runtimeKey: true,
            name: true,
            pairedAt: true,
            isVirtual: true,
            workspaceId: true,
            organizationId: true,
            status: true,
          },
        });

        await this.prisma.pairingSession.update({
          where: { id: session.id },
          data: {
            status: "CLAIMED",
            claimedAt: new Date(),
            claimedByUserId: auth.userId,
            screenId: updated.id,
            deviceId: deviceId?.trim() || null,
          },
        });

        return {
          ...updated,
          pairingCode: null,
        };
      }

      const created = await this.prisma.screen.create({
        data: {
          id,
          name: name?.trim() || "Android Player",
          pairedAt: new Date(),
          lastSeenAt: null,
          assignedPlaylistId: null,
          assignedContentType: null,
          assignedContentId: null,
          isVirtual: session.sessionType === "VIRTUAL_SCREEN",
          isArchived: false,
          status: "PAIRED",
          organizationId: auth.organizationId,
          workspaceId: auth.activeWorkspaceId,
          createdByUserId: auth.userId,
        },
        select: {
          id: true,
          runtimeKey: true,
          name: true,
          pairedAt: true,
          isVirtual: true,
          workspaceId: true,
          organizationId: true,
          status: true,
        },
      });

      await this.prisma.pairingSession.update({
        where: { id: session.id },
        data: {
          status: "CLAIMED",
          claimedAt: new Date(),
          claimedByUserId: auth.userId,
          screenId: created.id,
          deviceId: deviceId?.trim() || null,
        },
      });

      return {
        ...created,
        pairingCode: null,
      };
    }

    const created = await this.prisma.screen.create({
      data: {
        name: null,
        pairedAt: new Date(),
        lastSeenAt: null,
        assignedPlaylistId: null,
        assignedContentType: null,
        assignedContentId: null,
        isVirtual: session.sessionType === "VIRTUAL_SCREEN",
        isArchived: false,
        status: "PAIRED",
        organizationId: auth.organizationId,
        workspaceId: auth.activeWorkspaceId,
        createdByUserId: auth.userId,
      },
      select: {
        id: true,
        runtimeKey: true,
        name: true,
        pairedAt: true,
        isVirtual: true,
        workspaceId: true,
        organizationId: true,
        status: true,
      },
    });

    await this.prisma.pairingSession.update({
      where: { id: session.id },
      data: {
        status: "CLAIMED",
        claimedAt: new Date(),
        claimedByUserId: auth.userId,
        screenId: created.id,
        deviceId: deviceId?.trim() || null,
      },
    });

    return {
      ...created,
      pairingCode: null,
    };
  }

  private async resolveAssignedContentName(type: string | null, id: string | null) {
    if (!type || !id) return null;

    if (type === "PLAYLIST") {
      const pl = await this.prisma.playlist.findUnique({
        where: { id },
        select: { name: true },
      });
      return pl?.name ?? null;
    }

    if (type === "CHANNEL") {
      const ch = await this.prisma.channel
        .findUnique({ where: { id }, select: { name: true } })
        .catch(() => null);
      return ch?.name ?? `Channel (${id.slice(0, 6)}…)`;
    }

    if (type === "MEDIA") {
      const m = await this.prisma.media.findUnique({
        where: { id },
        select: { name: true, url: true },
      });
      if (m?.name) return m.name;
      if (m?.url) return m.url.split("/").pop() ?? m.url;
      return `Media (${id.slice(0, 6)}…)`;
    }

    return null;
  }

  async deleteByIdAndReturnRuntimeKey(auth: AuthContext, screenId: string) {
    const s = await this.getScopedScreenOrThrow(auth, screenId);
    await this.prisma.screen.delete({ where: { id: screenId } });
    return s.runtimeKey;
  }

  async getScreenSnapshotByIdInternal(screenId: string) {
    const s = await this.prisma.screen.findUnique({
      where: { id: screenId },
      include: {
        assignedPlaylist: true,
        pairingSessions: {
          where: {
            sessionType: "VIRTUAL_SCREEN",
            status: "OPEN",
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            pairingCode: true,
          },
        },
      },
    });

    if (!s) return null;

    const assignedContentType =
      (s.assignedContentType as any) ?? (s.assignedPlaylistId ? "PLAYLIST" : null);

    const assignedContentId =
      (s.assignedContentId as any) ?? (s.assignedPlaylistId ?? null);

    const assignedContentName = await this.resolveAssignedContentName(
      assignedContentType,
      assignedContentId,
    );

    const latestOpenVirtual = s.pairingSessions?.[0] ?? null;

    return {
      id: s.id,
      name: s.name,
      runtimeKey: s.runtimeKey,
      pairedAt: s.pairedAt ? s.pairedAt.toISOString() : null,
      lastSeenAt: s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
      isVirtual: !!s.isVirtual,
      assignedPlaylistId: s.assignedPlaylistId ?? null,
      assignedPlaylistName: s.assignedPlaylist?.name ?? null,
      assignedContentType,
      assignedContentId,
      assignedContentName,
      virtualSessionId: latestOpenVirtual?.id ?? null,
      activePairingCode: latestOpenVirtual?.pairingCode ?? null,
      orientation: (s as any).orientation ?? "LANDSCAPE",
      status: (s as any).status ?? "PENDING",
    };
  }

  async getAdminScreenSnapshotById(auth: AuthContext, screenId: string) {
    const s = await this.prisma.screen.findUnique({
      where: { id: screenId },
      select: {
        id: true,
        organizationId: true,
        workspaceId: true,
      },
    });

    if (!s || s.organizationId !== auth.organizationId) return null;

    if (!isOrgAdmin(auth) && s.workspaceId !== auth.activeWorkspaceId) {
      throw new ForbiddenException("Screen is outside active workspace");
    }

    return this.getScreenSnapshotByIdInternal(screenId);
  }

  async assignContent(
    auth: AuthContext,
    screenId: string,
    type: "PLAYLIST" | "CHANNEL" | "MEDIA",
    contentId: string,
  ) {
    const s = await this.getScopedScreenOrThrow(auth, screenId);

    if (type === "PLAYLIST") {
      const pl = await this.prisma.playlist.findUnique({
        where: { id: contentId },
        select: { id: true, organizationId: true, workspaceId: true, isArchived: true },
      });

      if (!pl || pl.organizationId !== auth.organizationId || pl.isArchived) {
        throw new NotFoundException("Playlist not found");
      }

      if (!isOrgAdmin(auth) && pl.workspaceId !== auth.activeWorkspaceId) {
        throw new ForbiddenException("Playlist is outside active workspace");
      }
    } else if (type === "MEDIA") {
      const m = await this.prisma.media.findUnique({
        where: { id: contentId },
        select: {
          id: true,
          organizationId: true,
          workspaceId: true,
          visibilityScope: true,
        },
      });

      if (!m || m.organizationId !== auth.organizationId) {
        throw new NotFoundException("Media not found");
      }

      if (
        !isOrgAdmin(auth) &&
        !(
          m.visibilityScope === "GLOBAL" ||
          (m.visibilityScope === "WORKSPACE" && m.workspaceId === auth.activeWorkspaceId)
        )
      ) {
        throw new ForbiddenException("Media is not accessible in active workspace");
      }
    } else if (type === "CHANNEL") {
      const ch = await this.prisma.channel.findUnique({
        where: { id: contentId },
        select: { id: true, orientation: true, organizationId: true, workspaceId: true, isArchived: true },
      });

      if (!ch || ch.organizationId !== auth.organizationId || ch.isArchived) {
        throw new NotFoundException("Channel not found");
      }

      if (!isOrgAdmin(auth) && ch.workspaceId !== auth.activeWorkspaceId) {
        throw new ForbiddenException("Channel is outside active workspace");
      }

      const so = screenBaseOrientation(s.orientation);
      const co = String(ch.orientation ?? "landscape");
      if (so !== co) {
        throw new BadRequestException(
          `Channel orientation (${co}) does not match screen orientation (${so}).`,
        );
      }
    }

    const nextAssignedPlaylistId = type === "PLAYLIST" ? contentId : null;

    const updated = await this.prisma.screen.update({
      where: { id: screenId },
      data: {
        assignedContentType: type,
        assignedContentId: contentId,
        assignedPlaylistId: nextAssignedPlaylistId,
      },
      include: {
        assignedPlaylist: true,
        pairingSessions: {
          where: {
            sessionType: "VIRTUAL_SCREEN",
            status: "OPEN",
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            pairingCode: true,
          },
        },
      },
    });

    const assignedContentName = await this.resolveAssignedContentName(
      updated.assignedContentType as any,
      updated.assignedContentId as any,
    );

    const latestOpenVirtual = updated.pairingSessions?.[0] ?? null;

    return {
      id: updated.id,
      name: updated.name,
      runtimeKey: updated.runtimeKey,
      pairedAt: updated.pairedAt ? updated.pairedAt.toISOString() : null,
      lastSeenAt: updated.lastSeenAt ? updated.lastSeenAt.toISOString() : null,
      isVirtual: !!updated.isVirtual,
      assignedPlaylistId: updated.assignedPlaylistId ?? null,
      assignedPlaylistName: updated.assignedPlaylist?.name ?? null,
      assignedContentType: (updated.assignedContentType as any) ?? null,
      assignedContentId: (updated.assignedContentId as any) ?? null,
      assignedContentName,
      virtualSessionId: latestOpenVirtual?.id ?? null,
      activePairingCode: latestOpenVirtual?.pairingCode ?? null,
      orientation: (updated as any).orientation ?? "LANDSCAPE",
      status: (updated as any).status ?? "PENDING",
    };
  }

  async getVirtualScreenStatePayloadByRuntimeKey(rawRuntimeKey: string): Promise<VsStatePayload> {
    const runtimeKey = this.normRuntimeKey(rawRuntimeKey);

    if (!runtimeKey) {
      return {
        runtimeKey: "",
        state: "PAIR",
        updatedAt: 0,
        playlistAssigned: false,
        exists: false,
        screenId: null,
        isVirtual: false,
        orientation: "LANDSCAPE",
      };
    }

    const s = await this.prisma.screen.findUnique({
      where: { runtimeKey },
      select: {
        id: true,
        updatedAt: true,
        assignedPlaylistId: true,
        assignedContentType: true,
        assignedContentId: true,
        isVirtual: true,
        orientation: true,
      },
    });

    if (!s) {
      return {
        runtimeKey,
        state: "PAIR",
        updatedAt: 0,
        playlistAssigned: false,
        exists: false,
        screenId: null,
        isVirtual: false,
        orientation: "LANDSCAPE",
      };
    }

    const updatedAtMs = s.updatedAt ? new Date(s.updatedAt as any).getTime() : 0;
    const hasAssigned = !!(s.assignedContentType && s.assignedContentId) || !!s.assignedPlaylistId;

    if (!hasAssigned) {
      return {
        runtimeKey,
        state: "WAITING",
        updatedAt: updatedAtMs,
        playlistAssigned: false,
        exists: true,
        screenId: s.id,
        isVirtual: !!s.isVirtual,
        orientation: (s as any).orientation ?? "LANDSCAPE",
      };
    }

    return {
      runtimeKey,
      state: "PLAYING",
      updatedAt: updatedAtMs,
      playlistAssigned: true,
      exists: true,
      screenId: s.id,
      isVirtual: !!s.isVirtual,
      orientation: (s as any).orientation ?? "LANDSCAPE",
    };
  }

  async getVirtualScreenPlaylistPayloadByRuntimeKey(rawRuntimeKey: string): Promise<VsPlaylistPayload> {
    const runtimeKey = this.normRuntimeKey(rawRuntimeKey);

    if (!runtimeKey) return { runtimeKey: "", playlistId: null, updatedAt: 0, items: [] };

    const s = await this.prisma.screen.findUnique({
      where: { runtimeKey },
      select: {
        id: true,
        updatedAt: true,
        assignedPlaylistId: true,
        assignedContentType: true,
        assignedContentId: true,
        timezone: true,
        workspace: {
          select: {
            timezone: true,
            organization: {
              select: {
                timezone: true,
              },
            },
          },
        },
      },
    });

    if (!s) return { runtimeKey, playlistId: null, updatedAt: 0, items: [] };

    const effectiveTimezone = safeTimezone(
      s.timezone,
      s.workspace?.timezone,
      s.workspace?.organization?.timezone,
      "UTC",
    );

    const updatedAtMs = s.updatedAt ? new Date(s.updatedAt as any).getTime() : 0;

    const ct = (s.assignedContentType as any) as "PLAYLIST" | "CHANNEL" | "MEDIA" | null;
    const cid = (s.assignedContentId as any) as string | null;

    const effectiveType: "PLAYLIST" | "CHANNEL" | "MEDIA" | null =
      ct ?? (s.assignedPlaylistId ? "PLAYLIST" : null);
    const effectiveId: string | null = cid ?? s.assignedPlaylistId ?? null;

    if (effectiveType === "MEDIA" && effectiveId) {
      const m = await this.prisma.media.findUnique({
        where: { id: effectiveId },
        select: { id: true, url: true, type: true, durationMs: true },
      });

      if (!m?.url) return { runtimeKey, playlistId: null, updatedAt: updatedAtMs, items: [] };

      const type = normalizeMediaType(m.type);
      const durationMs = computeDurationMs({ type, media: m });

      return {
        runtimeKey,
        playlistId: null,
        updatedAt: updatedAtMs,
        items: [{ id: String(m.id), type, url: String(m.url), order: 0, durationMs }],
      };
    }

    if (effectiveType === "CHANNEL" && effectiveId) {
      const channelId = effectiveId;

      const ch = await this.prisma.channel
        .findUnique({
          where: { id: channelId },
          select: {
            id: true,
            zones: true,
            layoutId: true,
            transition: true,
            updatedAt: true,
            orientation: true,
          },
        })
        .catch(() => null);

      if (!ch) return { runtimeKey, playlistId: null, updatedAt: updatedAtMs, items: [] };

      const chUpdatedAtMs = ch.updatedAt ? new Date(ch.updatedAt as any).getTime() : 0;
      const mergedUpdatedAtMs = Math.max(updatedAtMs, chUpdatedAtMs);

      const zonesJson = ((ch.zones as any) ?? {}) as Record<string, any[]>;
      const zoneIdsFromJson = Object.keys(zonesJson).filter((k) => Array.isArray(zonesJson[k]));
      const zoneIds = zoneIdsFromJson.length ? zoneIdsFromJson : ["z1"];

      const jsonMediaIds: string[] = [];
      for (const zid of zoneIds) {
        const arr = Array.isArray(zonesJson?.[zid]) ? zonesJson[zid] : [];
        for (const z of arr) {
          const st = String(z?.sourceType ?? "").toUpperCase();
          if (st === "MEDIA" && z?.sourceId) jsonMediaIds.push(String(z.sourceId));
        }
      }

      const zoneItems = await this.prisma.channelZoneItem.findMany({
        where: { channelId: channelId as any },
        orderBy: [{ zoneId: "asc" as any }, { order: "asc" }],
        select: {
          id: true,
          zoneId: true,
          sourceType: true,
          sourceId: true,
          order: true,
          durationSec: true,
          schedule: true,
          schedules: true,
        },
      });

      const dbMediaIds = zoneItems
        .filter((z) => String(z.sourceType ?? "").toUpperCase() === "MEDIA" && z.sourceId)
        .map((z) => String(z.sourceId));

      const mediaIds = Array.from(new Set([...jsonMediaIds, ...dbMediaIds]));

      const mediaRows = mediaIds.length
        ? await this.prisma.media.findMany({
            where: { id: { in: mediaIds } },
            select: { id: true, url: true, type: true, durationMs: true },
          })
        : [];

      const mediaById = new Map(mediaRows.map((m) => [String(m.id), m]));
      const zones: Record<string, VsPlaylistItem[]> = {};
      const now = new Date();

      const buildItem = (args: {
        id: string;
        type: "image" | "video";
        url: string;
        order: number;
        durationMs?: number;
        schedule?: ZoneItemSchedule | null;
        schedules?: ZoneItemSchedule[];
        transitionType?: string;
        transitionMs?: number;
      }) => {
        if (!args.url) return null;

        const it: VsPlaylistItem = {
          id: args.id,
          type: args.type,
          url: args.url,
          order: args.order,
        };

        if (typeof args.durationMs === "number" && Number.isFinite(args.durationMs)) {
          it.durationMs = args.durationMs;
        }

        if (args.schedule) {
          it.schedule = args.schedule;
        }

        if (Array.isArray(args.schedules) && args.schedules.length) {
          it.schedules = args.schedules;
        }

        if (args.transitionType) {
          it.transitionType = String(args.transitionType);
        }

        if (typeof args.transitionMs === "number" && Number.isFinite(args.transitionMs)) {
          it.transitionMs = args.transitionMs;
        }

        return it;
      };

      for (const zid of zoneIds) {
        const arr = Array.isArray(zonesJson?.[zid]) ? zonesJson[zid] : [];
        const built: VsPlaylistItem[] = [];

        for (let idx = 0; idx < arr.length; idx++) {
          const z = arr[idx];

          const schedules = ensureSchedulesFromItem(z);
          if (
            schedules.length &&
            !schedules.some((sch) => sch && isScheduleActive(sch, now, effectiveTimezone))
          ) {
            continue;
          }

          const directUrl = String(z?.url ?? "");
          const directTypeRaw = z?.type ?? z?.mediaType ?? "";
          const order = Number(z?.order ?? idx);

          if (directUrl) {
            const t = normalizeMediaType(directTypeRaw);
            const durationMs = computeDurationMs({ type: t, json: z });

            const it = buildItem({
              id: String(z?.id ?? `${zid}_json_${idx}`),
              type: t,
              url: directUrl,
              order,
              durationMs,
              schedule: z?.schedule ?? null,
              schedules: Array.isArray(z?.schedules) ? z.schedules : undefined,
              transitionType: z?.transitionType ?? z?.transition ?? undefined,
              transitionMs:
                z?.transitionMs != null
                  ? Number(z.transitionMs)
                  : z?.transitionDurationMs != null
                    ? Number(z.transitionDurationMs)
                    : undefined,
            });

            if (it) built.push(it);
            continue;
          }

          const st = String(z?.sourceType ?? "").toUpperCase();
          if (st !== "MEDIA" || !z?.sourceId) continue;

          const m = mediaById.get(String(z.sourceId));
          if (!m?.url) continue;

          const t = normalizeMediaType(m.type);
          const durationMs = computeDurationMs({ type: t, json: z, media: m });

          const it = buildItem({
            id: String(z?.id ?? `${zid}_json_${idx}`),
            type: t,
            url: String(m.url),
            order,
            durationMs,
            schedule: z?.schedule ?? null,
            schedules: Array.isArray(z?.schedules) ? z.schedules : undefined,
            transitionType: z?.transitionType ?? z?.transition ?? undefined,
            transitionMs:
              z?.transitionMs != null
                ? Number(z.transitionMs)
                : z?.transitionDurationMs != null
                  ? Number(z.transitionDurationMs)
                  : undefined,
          });

          if (it) built.push(it);
        }

        if (built.length === 0) {
          const zis = zoneItems.filter((x) => String(x.zoneId ?? "") === zid);

          for (let idx = 0; idx < zis.length; idx++) {
            const z = zis[idx];
            const st = String(z.sourceType ?? "").toUpperCase();
            if (st !== "MEDIA" || !z.sourceId) continue;

            const m = mediaById.get(String(z.sourceId));
            if (!m?.url) continue;

            const t = normalizeMediaType(m.type);
            const order2 = Number(z.order ?? idx);

            const dbSchedules = ensureSchedulesFromItem(z);
            if (
              dbSchedules.length &&
              !dbSchedules.some((sch) => sch && isScheduleActive(sch, now, effectiveTimezone))
            ) {
              continue;
            }

            const durationMs = computeDurationMs({
              type: t,
              json: { durationSec: z.durationSec },
              media: m,
            });

            const it = buildItem({
              id: String(z.id ?? `${zid}_db_${idx}`),
              type: t,
              url: String(m.url),
              order: order2,
              durationMs,
              schedule: (z.schedule as any) ?? null,
              schedules: Array.isArray(z.schedules) ? (z.schedules as any) : undefined,
            });

            if (it) built.push(it);
          }
        }

        built.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        zones[zid] = built;
      }

      const items = zones["z1"] ?? [];

      return {
        runtimeKey,
        playlistId: null,
        updatedAt: mergedUpdatedAtMs,
        items,
        channel: {
          channelId,
          layoutId: (ch.layoutId as any) ?? null,
          zones,
          transition: (ch.transition as any) ?? null,
          orientation: ch.orientation ?? "landscape",
        },
      };
    }

    if (effectiveType === "PLAYLIST" && effectiveId) {
      const playlistId = effectiveId;

      const pl = await this.prisma.playlist.findUnique({
        where: { id: playlistId },
        include: { items: { include: { media: true } } },
      });

      if (!pl) return { runtimeKey, playlistId, updatedAt: updatedAtMs, items: [] };

      const now = new Date();

      const items: VsPlaylistItem[] = (pl.items ?? [])
        .slice()
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
        .filter((it: any) => {
          const schedules = ensureSchedulesFromItem(it);
          if (!schedules.length) return true;
          return schedules.some((sch) => sch && isScheduleActive(sch, now, effectiveTimezone));
        })
        .map((it: any) => {
          const type = normalizeMediaType(it.media?.type);
          const url = String(it.media?.url ?? "");
          const order = Number(it.order ?? 0);

          const durationMs =
            typeof it.duration === "number" && Number.isFinite(it.duration)
              ? it.duration
              : computeDurationMs({ type, media: it.media });

          const mapped: VsPlaylistItem = { id: String(it.id ?? `${order}`), type, url, order, durationMs };

          if (it.schedule) mapped.schedule = it.schedule;
          if (Array.isArray(it.schedules) && it.schedules.length) mapped.schedules = it.schedules;

          return mapped;
        })
        .filter((x) => !!x.url);

      return { runtimeKey, playlistId, updatedAt: updatedAtMs, items };
    }

    return { runtimeKey, playlistId: null, updatedAt: updatedAtMs, items: [] };
  }

 async unpairScreen(auth: AuthContext, screenId: string) {
  const screen = await this.getScopedScreenOrThrow(auth, screenId);

  const now = new Date();
  const expiresAt = addMinutes(now, 10);

  await this.prisma.pairingSession.updateMany({
    where: {
      screenId: screen.id,
      status: { in: ["OPEN", "CLAIMED"] },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      cancelReason: "manual-unpair",
    },
  });

  const updatedScreen = await this.prisma.screen.update({
    where: { id: screen.id },
    data: {
      pairedAt: null,
      lastSeenAt: null,
      status: "PENDING",
      assignedPlaylistId: null,
      assignedContentType: null,
      assignedContentId: null,
      runtimeKey: crypto.randomUUID(),
    },
    select: {
      id: true,
      name: true,
      runtimeKey: true,
      pairedAt: true,
      lastSeenAt: true,
      isVirtual: true,
      assignedPlaylistId: true,
      assignedContentType: true,
      assignedContentId: true,
      orientation: true,
      status: true,
    },
  });

  const sessionType = updatedScreen.isVirtual ? "VIRTUAL_SCREEN" : "DEVICE";

  let pairingCode: string | null = null;

  const latestSession = await this.prisma.pairingSession.findFirst({
    where: {
      screenId: screen.id,
      sessionType,
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      pairingCode: true,
    },
  });

  if (latestSession?.pairingCode) {
    pairingCode = latestSession.pairingCode;
  } else {
    pairingCode = await this.generateUniquePairingCode();
  }

  await this.prisma.pairingSession.upsert({
    where: { pairingCode },
    update: {
      sessionType,
      status: "OPEN",
      organizationId: updatedScreen.isVirtual ? auth.organizationId : null,
      workspaceId: updatedScreen.isVirtual ? auth.activeWorkspaceId : null,
      createdByUserId: updatedScreen.isVirtual ? auth.userId : null,
      claimedByUserId: null,
      claimedAt: null,
      cancelledAt: null,
      cancelReason: null,
      screenId: screen.id,
      deviceId: updatedScreen.isVirtual ? null : screen.id,
      expiresAt,
      metadata: {
        source: updatedScreen.isVirtual
          ? "manual-unpair-reopen-virtual"
          : "manual-unpair-reopen-device",
        screenId: screen.id,
        deviceId: updatedScreen.isVirtual ? null : screen.id,
        name: updatedScreen.name ?? (updatedScreen.isVirtual ? "Virtual Screen" : "Android Player"),
        reopenedAt: now.toISOString(),
      },
    },
    create: {
      pairingCode,
      sessionType,
      status: "OPEN",
      organizationId: updatedScreen.isVirtual ? auth.organizationId : null,
      workspaceId: updatedScreen.isVirtual ? auth.activeWorkspaceId : null,
      createdByUserId: updatedScreen.isVirtual ? auth.userId : null,
      claimedByUserId: null,
      claimedAt: null,
      cancelledAt: null,
      cancelReason: null,
      screenId: screen.id,
      deviceId: updatedScreen.isVirtual ? null : screen.id,
      expiresAt,
      metadata: {
        source: updatedScreen.isVirtual
          ? "manual-unpair-reopen-virtual"
          : "manual-unpair-reopen-device",
        screenId: screen.id,
        deviceId: updatedScreen.isVirtual ? null : screen.id,
        name: updatedScreen.name ?? (updatedScreen.isVirtual ? "Virtual Screen" : "Android Player"),
        reopenedAt: now.toISOString(),
      },
    },
    select: {
      pairingCode: true,
    },
  });

  return this.getScreenSnapshotByIdInternal(screen.id);
}
}