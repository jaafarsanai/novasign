import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { randomUUID } from "node:crypto";

function makeCode6() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

type VSState = "PAIR" | "WAITING" | "PLAYING" | "UNKNOWN";

export type VsStatePayload = {
  code: string;
  state: VSState;
  updatedAt: number;
  playlistAssigned: boolean;

  exists: boolean;
  screenId: string | null;
  isVirtual: boolean;
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
  items: VsPlaylistItem[];
};

function normalizeMediaType(raw: unknown): "image" | "video" {
  const t = String(raw ?? "").toLowerCase();
  if (t === "video") return "video";
  return "image";
}

type VirtualSession = {
  id: string; // opaque id used in URL
  pairingCode: string; // 6-char code shown on screen
  createdAtMs: number;
  lastAccessAtMs: number;
};

@Injectable()
export class ScreensService {
  constructor(private readonly prisma: PrismaService) {}

  // In-memory: which pairing codes currently have an active virtual screen tab connected.
  private readonly activeVirtualCodes = new Set<string>();

  // In-memory: virtual sessions (URL id -> pairing code).
  private readonly virtualSessionsById = new Map<string, VirtualSession>();
  private readonly virtualSessionIdByCode = new Map<string, string>();

  private static readonly SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

  async getByPairingCodeOrNull(pairingCode: string) {
    const code = this.normCode(pairingCode);
    if (!code) return null;

    return this.prisma.screen.findFirst({
      where: { pairingCode: code },
      include: { assignedPlaylist: true },
    });
  }

  async touchLastSeenById(screenId: string) {
    await this.prisma.screen.update({
      where: { id: screenId },
      data: { lastSeenAt: new Date() },
    });
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

  async listScreens() {
    return this.prisma.screen.findMany({
      orderBy: { createdAt: "desc" },
      include: { assignedPlaylist: true },
    });
  }

  async pairByCodeUpsert(rawCode: string) {
    const pairingCode = this.normCode(rawCode);
    if (!pairingCode || pairingCode.length !== 6) {
      throw new NotFoundException("Invalid pairing code");
    }

    const existing = await this.prisma.screen.findFirst({ where: { pairingCode } });

    const shouldBeVirtual = this.hasVirtualSessionForCode(pairingCode) || this.isVirtualActive(pairingCode);

    if (!existing) {
      return this.prisma.screen.create({
        data: {
          name: null,
          pairingCode,
          pairedAt: new Date(),
          lastSeenAt: null,
          assignedPlaylistId: null,
          isVirtual: shouldBeVirtual,
        },
      });
    }

    return this.prisma.screen.update({
      where: { id: existing.id },
      data: {
        pairedAt: new Date(),
        ...(shouldBeVirtual ? { isVirtual: true } : {}),
      },
    });
  }

  async assignPlaylist(screenId: string, playlistId: string | null) {
    const s = await this.prisma.screen.findUnique({ where: { id: screenId } });
    if (!s) throw new NotFoundException("Screen not found");

    if (playlistId) {
      const pl = await this.prisma.playlist.findUnique({ where: { id: playlistId } });
      if (!pl) throw new NotFoundException("Playlist not found");
    }

    return this.prisma.screen.update({
      where: { id: screenId },
      data: { assignedPlaylistId: playlistId },
    });
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

  async getVirtualScreenStatePayload(rawCode: string): Promise<VsStatePayload> {
    const code = this.normCode(rawCode);
    const updatedAt = Date.now();

    if (!code) {
      return {
        code: "",
        state: "PAIR",
        updatedAt,
        playlistAssigned: false,
        exists: false,
        screenId: null,
        isVirtual: false,
      };
    }

    const s = await this.prisma.screen.findFirst({
      where: { pairingCode: code },
      select: {
        id: true,
        pairedAt: true,
        assignedPlaylistId: true,
        isVirtual: true,
      },
    });

    if (!s) {
      return {
        code,
        state: "PAIR",
        updatedAt,
        playlistAssigned: false,
        exists: false,
        screenId: null,
        isVirtual: false,
      };
    }

    const playlistAssigned = !!s.assignedPlaylistId;

    if (!playlistAssigned) {
      return {
        code,
        state: "WAITING",
        updatedAt,
        playlistAssigned: false,
        exists: true,
        screenId: s.id,
        isVirtual: !!s.isVirtual,
      };
    }

    return {
      code,
      state: "PLAYING",
      updatedAt,
      playlistAssigned: true,
      exists: true,
      screenId: s.id,
      isVirtual: !!s.isVirtual,
    };
  }

  async getVirtualScreenPlaylistPayload(rawCode: string): Promise<VsPlaylistPayload> {
    const code = this.normCode(rawCode);
    const updatedAt = Date.now();

    if (!code) {
      return { code: "", playlistId: null, updatedAt, items: [] };
    }

    const s = await this.prisma.screen.findFirst({
      where: { pairingCode: code },
      include: {
        assignedPlaylist: {
          include: {
            items: { include: { media: true } },
          },
        },
      },
    });

    if (!s) {
      return { code, playlistId: null, updatedAt, items: [] };
    }

    const playlistId = s.assignedPlaylist?.id ?? null;
    if (!s.assignedPlaylist) {
      return { code, playlistId: null, updatedAt, items: [] };
    }

    const items: VsPlaylistItem[] = (s.assignedPlaylist.items ?? [])
      .slice()
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      .map((it: any) => {
        const type = normalizeMediaType(it.media?.type);
        const url = String(it.media?.url ?? "");
        const order = Number(it.order ?? 0);

        const durationMs =
          typeof it.duration === "number" && Number.isFinite(it.duration)
            ? it.duration
            : type === "image"
              ? 5000
              : undefined;

        return {
          id: String(it.id ?? `${order}`),
          type,
          url,
          order,
          durationMs,
        };
      })
      .filter((x) => !!x.url);

    return { code, playlistId, updatedAt, items };
  }

  async getAdminScreenSnapshotById(screenId: string) {
    const s = await this.prisma.screen.findUnique({
      where: { id: screenId },
      include: { assignedPlaylist: true },
    });
    if (!s) return null;

    // IMPORTANT: include virtualSessionId so Preview never breaks after WS updates
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
      virtualSessionId,
    };
  }
}

