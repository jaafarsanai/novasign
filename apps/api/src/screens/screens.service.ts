// apps/api/src/screens/screens.service.ts

import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { randomUUID } from "node:crypto";

function makeCode6() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

type AdminScreenRow = {
  id: string;
  name: string | null;
  pairingCode: string;
  pairedAt: string | null;
  lastSeenAt: string | null;
  isVirtual: boolean;

  assignedPlaylistId: string | null;
  assignedPlaylistName: string | null;

  assignedContentType: "PLAYLIST" | "CHANNEL" | "MEDIA" | null;
  assignedContentId: string | null;
  assignedContentName: string | null;

  virtualSessionId: string | null;
    orientation: any; // ScreenOrientation
};

type VSState = "PAIR" | "WAITING" | "PLAYING" | "UNKNOWN";

export type VsStatePayload = {
  code: string;
  state: VSState;
  updatedAt: number;
  playlistAssigned: boolean;

  exists: boolean;
  screenId: string | null;
  isVirtual: boolean;
    orientation: any; // ScreenOrientation
};

export type VsPlaylistItem = {
  id: string;
  type: "image" | "video";
  url: string;
  order: number;
  durationMs?: number;
};

export type VsPlaylistPayload = {
  code: string;
  playlistId: string | null;
  updatedAt: number;
  items: VsPlaylistItem[]; // legacy fullscreen path (use z1)

  channel?: {
    channelId: string;
    layoutId: string | null;
    orientation?: "landscape" | "portrait";
    zones: Record<string, VsPlaylistItem[]>;
    transition?: any; // Channel.transition (JSON)
  };
};

function screenBaseOrientation(o: any): "landscape" | "portrait" {
  const s = String(o ?? "LANDSCAPE").toUpperCase();
  return s.startsWith("PORTRAIT") ? "portrait" : "landscape";
}

function normalizeMediaType(raw: unknown): "image" | "video" {
  const t = String(raw ?? "").toLowerCase();
  if (t === "video") return "video";
  return "image";
}

/**
 * Scheduling types (mirrors admin-web/src/lib/scheduling.ts)
 */
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYmdLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function weekdayOf(d: Date): Weekday {
  const map: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return map[d.getDay()];
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

function computeDurationMs(args: {
  type: "image" | "video";
  json?: any; // zone json item (may contain durationMs/durationSec)
  media?: { durationMs?: number | null }; // db media row
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
    // image: always return something sane
    if (typeof jsonMs === "number" && jsonMs >= 500) return jsonMs;
    if (typeof jsonSec === "number" && jsonSec > 0) return Math.max(500, Math.floor(jsonSec * 1000));
    if (typeof dbMs === "number" && dbMs >= 500) return dbMs;
    return 5000;
  }

  // video: ONLY accept explicit sane durationMs (no durationSec fallback, no tiny defaults)
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

function nowSecOfDay(d: Date) {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

function ensureSchedulesFromItem(it: any): ZoneItemSchedule[] {
  if (Array.isArray(it?.schedules) && it.schedules.length) return it.schedules as ZoneItemSchedule[];
  if (it?.schedule) return [it.schedule as ZoneItemSchedule];
  return [];
}

/**
 * ✅ Schedule evaluation (server-side)
 */
function isScheduleActive(s: ZoneItemSchedule, now: Date) {
  const ymd = toYmdLocal(now);

  // 1) Date range gate
  if (s.dateOnlyEnabled) {
    if (!s.dateStart || !s.dateEnd) return false;
  }
  if (s.dateStart && ymd < s.dateStart) return false;
  if (s.dateEnd && ymd > s.dateEnd) return false;

  // 2) Weekly gate
  if (s.mode === "weekly") {
    const wd = weekdayOf(now);
    const days: Weekday[] =
      s.weeklyDays?.length
        ? (s.weeklyDays as Weekday[])
        : (["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as Weekday[]);
    if (!days.includes(wd)) return false;
  }

  // 3) Time window gate (any mode)
  if (!s.timeWindows || s.timeWindows.length === 0) return true;

  const t = nowSecOfDay(now);
  return s.timeWindows.some((w) => {
    const a = timeToSec(w.startTime);
    const b = timeToSec(w.endTime);
    return t >= a && t <= b;
  });
}

type VirtualSession = {
  id: string;
  pairingCode: string;
  createdAtMs: number;
  lastAccessAtMs: number;
};

@Injectable()
export class ScreensService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly activeVirtualCodes = new Set<string>();
  private readonly virtualSessionsById = new Map<string, VirtualSession>();
  private readonly virtualSessionIdByCode = new Map<string, string>();

  private static readonly SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  private normCode(code: any) {
    return String(code || "").trim().toUpperCase();
  }

  private makeSessionId() {
    return randomUUID().replace(/-/g, "");
  }

  private pruneVirtualSessions(now = Date.now()) {
    for (const [id, s] of this.virtualSessionsById) {
      if (now - s.lastAccessAtMs > ScreensService.SESSION_TTL_MS) {
        this.virtualSessionsById.delete(id);
        const mapped = this.virtualSessionIdByCode.get(s.pairingCode);
        if (mapped === id) this.virtualSessionIdByCode.delete(s.pairingCode);
      }
    }
  }

  markVirtualConnected(rawCode: string) {
    const code = this.normCode(rawCode);
    if (code && code.length === 6) this.activeVirtualCodes.add(code);
  }

  markVirtualDisconnected(rawCode: string) {
    const code = this.normCode(rawCode);
    if (code) this.activeVirtualCodes.delete(code);
  }

  private isVirtualActive(rawCode: string) {
    const code = this.normCode(rawCode);
    return this.activeVirtualCodes.has(code);
  }

  private hasVirtualSessionForCode(rawCode: string) {
    const code = this.normCode(rawCode);
    return this.virtualSessionIdByCode.has(code);
  }

  async createVirtualSession() {
    this.pruneVirtualSessions();

    let pairingCode = makeCode6();

    for (let i = 0; i < 40; i++) {
      const existsInDb = await this.prisma.screen.findFirst({ where: { pairingCode } });
      const existsInSessions = this.virtualSessionIdByCode.has(pairingCode);
      if (!existsInDb && !existsInSessions) break;
      pairingCode = makeCode6();
    }

    const id = this.makeSessionId();
    const now = Date.now();

    const session: VirtualSession = {
      id,
      pairingCode,
      createdAtMs: now,
      lastAccessAtMs: now,
    };

    this.virtualSessionsById.set(id, session);
    this.virtualSessionIdByCode.set(pairingCode, id);

    return { id, code: pairingCode };
  }

  ensureVirtualSessionForCode(rawCode: string) {
    this.pruneVirtualSessions();

    const code = this.normCode(rawCode);
    if (!code || code.length !== 6) return null;

    const existingId = this.virtualSessionIdByCode.get(code);
    if (existingId && this.virtualSessionsById.has(existingId)) {
      const s = this.virtualSessionsById.get(existingId)!;
      s.lastAccessAtMs = Date.now();
      return existingId;
    }

    const id = this.makeSessionId();
    const now = Date.now();
    const session: VirtualSession = { id, pairingCode: code, createdAtMs: now, lastAccessAtMs: now };

    this.virtualSessionsById.set(id, session);
    this.virtualSessionIdByCode.set(code, id);
    return id;
  }

async updateScreenById(
  id: string,
  dto: { name?: string; orientation?: "LANDSCAPE" | "LANDSCAPE_FLIPPED" | "PORTRAIT" | "PORTRAIT_FLIPPED" }
) {
  const existing = await this.prisma.screen.findUnique({
    where: { id },
    select: {
      id: true,
      assignedPlaylistId: true,
      assignedContentType: true,
      assignedContentId: true,
      orientation: true,
    },
  });
  if (!existing) throw new NotFoundException("Screen not found");

  // If changing orientation and current assignment is a channel, enforce compatibility
  if (dto.orientation) {
    const effectiveType =
      (existing.assignedContentType as any) ?? (existing.assignedPlaylistId ? "PLAYLIST" : null);
    const effectiveId =
      (existing.assignedContentId as any) ?? (existing.assignedPlaylistId ?? null);

    if (effectiveType === "CHANNEL" && effectiveId) {
      const ch = await this.prisma.channel.findUnique({
        where: { id: String(effectiveId) as any },
        select: { orientation: true },
      });
      if (ch) {
        const so = screenBaseOrientation(dto.orientation);
        const co = String(ch.orientation ?? "landscape");
        if (so !== co) {
          throw new BadRequestException(
            `Channel orientation (${co}) does not match screen orientation (${so}).`
          );
        }
      }
    }
  }

  const data: any = {};
  if (dto.name != null) data.name = String(dto.name);
  if (dto.orientation != null) data.orientation = dto.orientation;

  try {
    return await this.prisma.screen.update({ where: { id }, data });
  } catch (e: any) {
    if (e?.code === "P2025") throw new NotFoundException("Screen not found");
    throw e;
  }
}
  async getByPairingCodeOrNull(pairingCode: string) {
    const code = this.normCode(pairingCode);
    if (!code) return null;

    return this.prisma.screen.findFirst({
      where: { pairingCode: code },
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

  async touchLastSeenByPairingCode(rawCode: string) {
    const code = this.normCode(rawCode);
    if (!code) return;

    const s = await this.prisma.screen.findFirst({
      where: { pairingCode: code },
      select: { id: true },
    });

    if (!s) return;
    await this.touchLastSeenById(s.id);
  }

  getVirtualSessionByIdOrNull(sessionId: string) {
    this.pruneVirtualSessions();

    const id = String(sessionId || "").trim();
    if (!id) return null;

    const s = this.virtualSessionsById.get(id) ?? null;
    if (s) s.lastAccessAtMs = Date.now();
    return s;
  }

  getVirtualSessionIdByCodeOrNull(rawCode: string) {
    this.pruneVirtualSessions();

    const code = this.normCode(rawCode);
    if (!code) return null;

    const id = this.virtualSessionIdByCode.get(code) ?? null;
    if (!id) return null;

    const s = this.virtualSessionsById.get(id);
    if (!s) {
      this.virtualSessionIdByCode.delete(code);
      return null;
    }

    s.lastAccessAtMs = Date.now();
    return id;
  }

  async listScreensForAdmin(): Promise<AdminScreenRow[]> {
    const rows = await this.prisma.screen.findMany({
      orderBy: { createdAt: "desc" },
      include: { assignedPlaylist: true },
    });

    return Promise.all(
      rows.map(async (s): Promise<AdminScreenRow> => {
        const assignedContentType =
          (s.assignedContentType as any) ?? (s.assignedPlaylistId ? "PLAYLIST" : null);

        const assignedContentId = (s.assignedContentId as any) ?? (s.assignedPlaylistId ?? null);

        const assignedContentName = await this.resolveAssignedContentName(
          assignedContentType,
          assignedContentId
        );

        const virtualSessionId = s.isVirtual ? this.ensureVirtualSessionForCode(s.pairingCode) : null;

        return {
          id: s.id,
          name: s.name,
          pairingCode: s.pairingCode,
          pairedAt: s.pairedAt ? s.pairedAt.toISOString() : null,
          lastSeenAt: s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
          isVirtual: !!s.isVirtual,

          assignedPlaylistId: s.assignedPlaylistId ?? null,
          assignedPlaylistName: s.assignedPlaylist?.name ?? null,

          assignedContentType,
          assignedContentId,
          assignedContentName,

          virtualSessionId,
          orientation: (s as any).orientation ?? "LANDSCAPE",
        };
      })
    );
  }

// inside ScreensService class
async pairByCodeUpsert(rawCode: string, deviceId?: string, name?: string) {
  const pairingCode = this.normCode(rawCode);
  if (!pairingCode || pairingCode.length !== 6) {
    throw new NotFoundException("Invalid pairing code");
  }

  const shouldBeVirtual =
    this.hasVirtualSessionForCode(pairingCode) || this.isVirtualActive(pairingCode);

  // ✅ If deviceId provided -> bind to that device row
  if (deviceId && String(deviceId).trim()) {
    const id = String(deviceId).trim();

    const existingByCode = await this.prisma.screen.findFirst({ where: { pairingCode } });
    if (existingByCode && existingByCode.id !== id) {
      throw new BadRequestException("Pairing code is already used by another screen.");
    }

    const existingById = await this.prisma.screen.findUnique({ where: { id } }).catch(() => null);

    if (!existingById) {
      return this.prisma.screen.create({
        data: {
          id,
          name: name?.trim() || "Android Player",
          pairingCode,
          pairedAt: new Date(),
          lastSeenAt: null,
          assignedPlaylistId: null,
          assignedContentType: null,
          assignedContentId: null,
          isVirtual: false, // ✅ device
        },
      });
    }

    return this.prisma.screen.update({
      where: { id },
      data: {
        name: name?.trim() || existingById.name,
        pairingCode,
        pairedAt: new Date(),
        isVirtual: false, // ✅ force device
      },
    });
  }

  // ✅ Code-only pairing (admin enters code)
  const existing = await this.prisma.screen.findFirst({ where: { pairingCode } });

  if (!existing) {
    return this.prisma.screen.create({
      data: {
        name: null,
        pairingCode,
        pairedAt: new Date(),
        lastSeenAt: null,
        assignedPlaylistId: null,
        assignedContentType: null,
        assignedContentId: null,
        isVirtual: shouldBeVirtual,
      },
    });
  }

  // ✅ IMPORTANT FIX: force isVirtual to the computed truth (can become false)
  return this.prisma.screen.update({
    where: { id: existing.id },
    data: {
      pairedAt: new Date(),
      isVirtual: shouldBeVirtual,
    },
  });
}

  private async resolveAssignedContentName(type: string | null, id: string | null) {
    if (!type || !id) return null;

    if (type === "PLAYLIST") {
      const pl = await this.prisma.playlist.findUnique({ where: { id }, select: { name: true } });
      return pl?.name ?? null;
    }

    if (type === "CHANNEL") {
      const ch = await this.prisma.channel
        .findUnique({ where: { id }, select: { name: true } })
        .catch(() => null);
      return ch?.name ?? `Channel (${id.slice(0, 6)}…)`;
    }

    if (type === "MEDIA") {
      const m = await this.prisma.media.findUnique({ where: { id }, select: { name: true, url: true } });
      if (m?.name) return m.name;
      if (m?.url) return m.url.split("/").pop() ?? m.url;
      return `Media (${id.slice(0, 6)}…)`;
    }

    return null;
  }

  async renameScreenById(id: string, name: string) {
    try {
      return await this.prisma.screen.update({
        where: { id },
        data: { name },
      });
    } catch (e: any) {
      if (e?.code === "P2025") throw new NotFoundException("Screen not found");
      throw e;
    }
  }

  async deleteByIdAndReturnCode(screenId: string) {
    const s = await this.prisma.screen.findUnique({ where: { id: screenId } });
    if (!s) throw new NotFoundException("Screen not found");

    const code = s.pairingCode;
    await this.prisma.screen.delete({ where: { id: screenId } });
    return code;
  }

  async getAdminScreenSnapshotById(screenId: string) {
    const s = await this.prisma.screen.findUnique({
      where: { id: screenId },
      include: { assignedPlaylist: true },
    });
    if (!s) return null;

    const assignedContentType =
      (s.assignedContentType as any) ?? (s.assignedPlaylistId ? "PLAYLIST" : null);

    const assignedContentId = (s.assignedContentId as any) ?? (s.assignedPlaylistId ?? null);

    const assignedContentName = await this.resolveAssignedContentName(assignedContentType, assignedContentId);

    const virtualSessionId = s.isVirtual ? this.ensureVirtualSessionForCode(s.pairingCode) : null;

    return {
      id: s.id,
      name: s.name,
      pairingCode: s.pairingCode,
      pairedAt: s.pairedAt ? s.pairedAt.toISOString() : null,
      lastSeenAt: s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
      isVirtual: !!s.isVirtual,

      assignedPlaylistId: s.assignedPlaylistId ?? null,
      assignedPlaylistName: s.assignedPlaylist?.name ?? null,

      assignedContentType,
      assignedContentId,
      assignedContentName,

      virtualSessionId,
      orientation: (s as any).orientation ?? "LANDSCAPE",
    };
  }

  /**
   * ✅ Generic content assignment
   */
  async assignContent(screenId: string, type: "PLAYLIST" | "CHANNEL" | "MEDIA", contentId: string) {
    const s = await this.prisma.screen.findUnique({ where: { id: screenId } });
    if (!s) throw new NotFoundException("Screen not found");

    if (type === "PLAYLIST") {
      const pl = await this.prisma.playlist.findUnique({ where: { id: contentId }, select: { id: true } });
      if (!pl) throw new NotFoundException("Playlist not found");
    } else if (type === "MEDIA") {
      const m = await this.prisma.media.findUnique({ where: { id: contentId }, select: { id: true } });
      if (!m) throw new NotFoundException("Media not found");
    } else if (type === "CHANNEL") {
  const screen = await this.prisma.screen.findUnique({
    where: { id: screenId },
    select: { orientation: true },
  });
  if (!screen) throw new NotFoundException("Screen not found");

  const ch = await this.prisma.channel.findUnique({
    where: { id: contentId },
    select: { id: true, orientation: true },
  });
  if (!ch) throw new NotFoundException("Channel not found");

  const so = screenBaseOrientation(screen.orientation);
  const co = String(ch.orientation ?? "landscape"); // prisma enum: landscape|portrait
  if (so !== co) {
    throw new BadRequestException(
      `Channel orientation (${co}) does not match screen orientation (${so}).`
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
      include: { assignedPlaylist: true },
    });

    const assignedContentName = await this.resolveAssignedContentName(
      updated.assignedContentType as any,
      updated.assignedContentId as any
    );

    const virtualSessionId = updated.isVirtual ? this.ensureVirtualSessionForCode(updated.pairingCode) : null;

    return {
      id: updated.id,
      name: updated.name,
      pairingCode: updated.pairingCode,
      pairedAt: updated.pairedAt ? updated.pairedAt.toISOString() : null,
      lastSeenAt: updated.lastSeenAt ? updated.lastSeenAt.toISOString() : null,
      isVirtual: !!updated.isVirtual,

      assignedPlaylistId: updated.assignedPlaylistId ?? null,
      assignedPlaylistName: updated.assignedPlaylist?.name ?? null,

      assignedContentType: (updated.assignedContentType as any) ?? null,
      assignedContentId: (updated.assignedContentId as any) ?? null,
      assignedContentName,

      virtualSessionId,
    };
  }

  /**
   * ✅ Virtual Screen state payload with STABLE updatedAt (from Screen.updatedAt ONLY)
   */
  async getVirtualScreenStatePayload(rawCode: string): Promise<VsStatePayload> {
    const code = this.normCode(rawCode);

    if (!code) {
      return {
        code: "",
        state: "PAIR",
        updatedAt: 0,
        playlistAssigned: false,
        exists: false,
        screenId: null,
        isVirtual: false,
        orientation: "LANDSCAPE",
      };
    }

    const s = await this.prisma.screen.findFirst({
      where: { pairingCode: code },
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
        code,
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
        code,
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
      code,
      state: "PLAYING",
      updatedAt: updatedAtMs,
      playlistAssigned: true,
      exists: true,
      screenId: s.id,
      isVirtual: !!s.isVirtual,
      orientation: (s as any).orientation ?? "LANDSCAPE",
    };
  }

  /**
   * ✅ Virtual Screen playlist payload
   * - MEDIA => single item
   * - CHANNEL => ALL zones from Channel.zones JSON (z1, z2, ...)
   * - PLAYLIST => legacy playlist items
   * ✅ updatedAt is MERGED for CHANNEL: max(screen.updatedAt, channel.updatedAt)
   */
  async getVirtualScreenPlaylistPayload(rawCode: string): Promise<VsPlaylistPayload> {
    const code = this.normCode(rawCode);

    if (!code) return { code: "", playlistId: null, updatedAt: 0, items: [] };

    const s = await this.prisma.screen.findFirst({
      where: { pairingCode: code },
      select: {
        updatedAt: true,
        assignedPlaylistId: true,
        assignedContentType: true,
        assignedContentId: true,
      },
    });

    if (!s) return { code, playlistId: null, updatedAt: 0, items: [] };

    const updatedAtMs = s.updatedAt ? new Date(s.updatedAt as any).getTime() : 0;

    const ct = (s.assignedContentType as any) as "PLAYLIST" | "CHANNEL" | "MEDIA" | null;
    const cid = (s.assignedContentId as any) as string | null;

    const effectiveType: "PLAYLIST" | "CHANNEL" | "MEDIA" | null =
      ct ?? (s.assignedPlaylistId ? "PLAYLIST" : null);
    const effectiveId: string | null = cid ?? s.assignedPlaylistId ?? null;

    // -------------------------
    // 1) MEDIA => single item
    // -------------------------
    if (effectiveType === "MEDIA" && effectiveId) {
      const m = await this.prisma.media.findUnique({
        where: { id: effectiveId },
        select: { id: true, url: true, type: true, durationMs: true },
      });

      if (!m?.url) return { code, playlistId: null, updatedAt: updatedAtMs, items: [] };

      const type = normalizeMediaType(m.type);
      const durationMs = computeDurationMs({ type, media: m }); // video => usually undefined unless explicit

      return {
        code,
        playlistId: null,
        updatedAt: updatedAtMs,
        items: [{ id: String(m.id), type, url: String(m.url), order: 0, durationMs }],
      };
    }

    // -------------------------
    // 2) CHANNEL => ALL ZONES (schedule filtering on JSON items)
    // -------------------------
    if (effectiveType === "CHANNEL" && effectiveId) {
      const channelId = effectiveId;

      const ch = await this.prisma.channel
        .findUnique({
          where: { id: channelId },
          select: { id: true, zones: true, layoutId: true, transition: true, updatedAt: true, orientation: true },
        })
        .catch(() => null);

      if (!ch) return { code, playlistId: null, updatedAt: updatedAtMs, items: [] };

      const chUpdatedAtMs = ch.updatedAt ? new Date(ch.updatedAt as any).getTime() : 0;
      const mergedUpdatedAtMs = Math.max(updatedAtMs, chUpdatedAtMs);

      const zonesJson = ((ch.zones as any) ?? {}) as Record<string, any[]>;

      const zoneIdsFromJson = Object.keys(zonesJson).filter((k) => Array.isArray(zonesJson[k]));
      const zoneIds = zoneIdsFromJson.length ? zoneIdsFromJson : ["z1"];

      // Collect referenced media ids from JSON
      const jsonMediaIds: string[] = [];
      for (const zid of zoneIds) {
        const arr = Array.isArray(zonesJson?.[zid]) ? zonesJson[zid] : [];
        for (const z of arr) {
          const st = String(z?.sourceType ?? "").toUpperCase();
          if (st === "MEDIA" && z?.sourceId) jsonMediaIds.push(String(z.sourceId));
        }
      }

      // Load DB zone items (fallback per zone)
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
      }) => {
        if (!args.url) return null;
        const it: VsPlaylistItem = { id: args.id, type: args.type, url: args.url, order: args.order };
        if (typeof args.durationMs === "number" && Number.isFinite(args.durationMs)) it.durationMs = args.durationMs;
        return it;
      };

      for (const zid of zoneIds) {
        const arr = Array.isArray(zonesJson?.[zid]) ? zonesJson[zid] : [];
        const built: VsPlaylistItem[] = [];

        // A) Prefer JSON (with schedule filter)
        for (let idx = 0; idx < arr.length; idx++) {
          const z = arr[idx];

          const schedules = ensureSchedulesFromItem(z);
          if (schedules.length && !schedules.some((sch) => sch && isScheduleActive(sch, now))) continue;

          const directUrl = String(z?.url ?? "");
          const directTypeRaw = z?.type ?? z?.mediaType ?? "";
          const order = Number(z?.order ?? idx);

          // A1) JSON provides url directly
          if (directUrl) {
            const t = normalizeMediaType(directTypeRaw);
            const durationMs = computeDurationMs({ type: t, json: z });

            const it = buildItem({
              id: String(z?.id ?? `${zid}_json_${idx}`),
              type: t,
              url: directUrl,
              order,
              durationMs,
            });
            if (it) built.push(it);
            continue;
          }

          // A2) JSON references MEDIA by id
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
          });
          if (it) built.push(it);
        }

        // B) Fallback to DB zone items
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
            });
            if (it) built.push(it);
          }
        }

        built.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        zones[zid] = built;
      }

      // Backward compat: "items" == z1
      const items = zones["z1"] ?? [];

      return {
        code,
        playlistId: null,
        updatedAt: mergedUpdatedAtMs, // ✅ FIXED (use merged)
        items,
        channel: {
          channelId,
          layoutId: (ch.layoutId as any) ?? null,
          zones,
          transition: (ch.transition as any) ?? null, // ✅ includes UI transition config
          orientation: ch.orientation ?? "landscape",
        },
      };
    }

    // -------------------------
    // 3) PLAYLIST (legacy + generic)
    // -------------------------
    if (effectiveType === "PLAYLIST" && effectiveId) {
      const playlistId = effectiveId;

      const pl = await this.prisma.playlist.findUnique({
        where: { id: playlistId },
        include: { items: { include: { media: true } } },
      });

      if (!pl) return { code, playlistId, updatedAt: updatedAtMs, items: [] };

      const now = new Date();

      const items: VsPlaylistItem[] = (pl.items ?? [])
        .slice()
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
        .filter((it: any) => {
          const schedules = ensureSchedulesFromItem(it);
          if (!schedules.length) return true;
          return schedules.some((sch) => sch && isScheduleActive(sch, now));
        })
        .map((it: any) => {
          const type = normalizeMediaType(it.media?.type);
          const url = String(it.media?.url ?? "");
          const order = Number(it.order ?? 0);

          const durationMs =
            typeof it.duration === "number" && Number.isFinite(it.duration)
              ? it.duration
              : computeDurationMs({ type, media: it.media });

          return { id: String(it.id ?? `${order}`), type, url, order, durationMs };
        })
        .filter((x) => !!x.url);

      return { code, playlistId, updatedAt: updatedAtMs, items };
    }

    return { code, playlistId: null, updatedAt: updatedAtMs, items: [] };
  }
}