import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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

  // tells the client if the code currently exists in DB
  exists: boolean;

  // useful for UI/debug/preview
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

@Injectable()
export class ScreensService {
  constructor(private readonly prisma: PrismaService) {}

  // IMPORTANT: this is in-memory ONLY. It does NOT create DB rows.
  // It lets pairByCodeUpsert know whether a pairing code is currently coming from a Virtual Screen tab.
  private readonly activeVirtualCodes = new Set<string>();

  private normCode(code: any) {
    return String(code || "").trim().toUpperCase();
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

  // list for admin table
  async listScreens() {
    return this.prisma.screen.findMany({
      orderBy: { createdAt: "desc" },
      include: { assignedPlaylist: true },
    });
  }

  // virtual session returns ONLY a code (no DB insert)
  async createVirtualSession() {
    let code = makeCode6();

    for (let i = 0; i < 20; i++) {
      const exists = await this.prisma.screen.findFirst({ where: { pairingCode: code } });
      if (!exists) break;
      code = makeCode6();
    }

    return { code };
  }

  /**
   * Pairing upsert:
   * - Creates DB row ONLY when pairing happens.
   * - If the pairing code is currently active in a /virtual-screen tab, mark isVirtual=true.
   * - Otherwise it’s a physical/device pairing code (isVirtual=false).
   */
  async pairByCodeUpsert(rawCode: string) {
    const pairingCode = this.normCode(rawCode);
    if (!pairingCode || pairingCode.length !== 6) {
      throw new NotFoundException("Invalid pairing code");
    }

    const existing = await this.prisma.screen.findFirst({ where: { pairingCode } });

    // decide virtual vs device based on whether a virtual-screen tab is currently connected with that code
    const shouldBeVirtual = this.isVirtualActive(pairingCode);

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
        // if the code is active in virtual-screen, ensure isVirtual=true
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

  async deleteByIdAndReturnCode(screenId: string) {
    const s = await this.prisma.screen.findUnique({ where: { id: screenId } });
    if (!s) throw new NotFoundException("Screen not found");

    const code = s.pairingCode;
    await this.prisma.screen.delete({ where: { id: screenId } });
    return code;
  }

  /**
   * State for VirtualScreenPage:
   * - If screen does not exist => PAIR, exists=false
   * - If exists and isVirtual => WAIT/PLAY based on playlist
   * - If exists and NOT virtual => requires pairedAt to not be PAIR
   */
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

    // Physical device must be paired
    if (!s.isVirtual && !s.pairedAt) {
      return {
        code,
        state: "PAIR",
        updatedAt,
        playlistAssigned,
        exists: true,
        screenId: s.id,
        isVirtual: false,
      };
    }

    // No playlist assigned => WAITING
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

    // Playlist assigned => PLAYING
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

    // Physical device must be paired; virtual is eligible without extra checks
    if (!s.isVirtual && !s.pairedAt) {
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

  async listPairedScreensByPlaylistId(playlistId: string) {
    if (!playlistId) return [];
    return this.prisma.screen.findMany({
      where: {
        assignedPlaylistId: playlistId,
        pairedAt: { not: null },
      },
      select: { id: true, pairingCode: true },
    });
  }
  async getAdminScreenSnapshotById(screenId: string) {
  const s = await this.prisma.screen.findUnique({
    where: { id: screenId },
    include: { assignedPlaylist: true },
  });
  if (!s) return null;

  return {
    id: s.id,
    name: s.name,
    pairingCode: s.pairingCode,
    pairedAt: s.pairedAt ? s.pairedAt.toISOString() : null,
    lastSeenAt: s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
    isVirtual: !!s.isVirtual,
    assignedPlaylistId: s.assignedPlaylistId ?? null,
    assignedPlaylistName: s.assignedPlaylist?.name ?? null,
  };
}

}

