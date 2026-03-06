// apps/admin-web/src/pages/virtual-screen/VirtualScreenPage.tsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { io, Socket } from "socket.io-client";
import { ensureSchedules, isScheduleActive, pickFullscreenOverride } from "../../lib/scheduling";
import type { ZoneItemSchedule } from "../../lib/scheduling";
import "./VirtualScreenPage.css";

import { ALL_LAYOUTS } from "../channels/layouts/ChannelLayouts";

const DESIGN_W = 1920;
const DESIGN_H = 1080;

const DEFAULT_TRANSITION_TYPE = "fade";
const DEFAULT_TRANSITION_MS = 500;

type VSState = "PAIR" | "WAITING" | "PLAYING" | "UNKNOWN";

type ScreenOrientation4 = "LANDSCAPE" | "LANDSCAPE_FLIPPED" | "PORTRAIT" | "PORTRAIT_FLIPPED";

type VsStatePayload = {
  code: string;
  state: VSState;
  updatedAt: number;
  playlistAssigned: boolean;
  exists: boolean;
  screenId: string | null;
  isVirtual: boolean;
  orientation?: ScreenOrientation4;
};

type VsPlaylistItem = {
  id: string;
  type: "image" | "video";
  url: string;
  order: number;
  durationMs?: number;

  schedules?: ZoneItemSchedule[];
  schedule?: ZoneItemSchedule;

  transitionType?: string;
  transitionMs?: number;
};

type ChannelTransition =
  | {
      enabled?: boolean;
      type?: string; // Fade | Slide | Push | Wipe | Zoom
      durationSec?: number;
      durationMs?: number;
      direction?: string;
      easing?: string;
      fadeColor?: string;
      zoom?: "in" | "out";
      startScale?: number;
    }
  | null
  | undefined;

type VsPlaylistPayload = {
  code: string;
  playlistId: string | null;
  updatedAt: number;
  items: VsPlaylistItem[];
  channel?: {
    channelId: string;
    layoutId: string | null;
    zones: Record<string, unknown>;
    transition?: ChannelTransition;
    orientation?: "landscape" | "portrait";
  };
};

type ZoneRect = {
  id: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

function openKey(code: string) {
  return `ns2:vs-open:${code}`;
}

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function isVsPlaylistItem(x: any): x is VsPlaylistItem {
  return x && typeof x.id === "string" && (x.type === "image" || x.type === "video") && typeof x.url === "string";
}

type MediaRow = { id: string; url: string; type: "image" | "video"; name?: string; thumbnailUrl?: string };

let mediaIndexCache: Record<string, MediaRow> | null = null;
let mediaIndexInFlight: Promise<Record<string, MediaRow>> | null = null;

async function ensureMediaIndex(): Promise<Record<string, MediaRow>> {
  if (mediaIndexCache && Object.keys(mediaIndexCache).length) return mediaIndexCache;
  if (mediaIndexInFlight) return mediaIndexInFlight;

  mediaIndexInFlight = (async () => {
    const endpoints = ["/api/media?folderId=root&recursive=true", "/api/media?folderId=root", "/api/media"];

    for (const url of endpoints) {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) continue;

      const data = await res.json().catch(() => null);
      if (!data) continue;

      const list: any[] =
        (Array.isArray(data?.items?.items) && data.items.items) ||
        (Array.isArray(data?.items) && data.items) ||
        (Array.isArray(data?.data) && data.data) ||
        [];

      const idx: Record<string, MediaRow> = {};
      for (const it of list) {
        if (!it?.id || !it?.url || (it.type !== "image" && it.type !== "video")) continue;
        idx[String(it.id)] = {
          id: String(it.id),
          url: String(it.url),
          type: it.type,
          name: it.name,
          thumbnailUrl: it.thumbnailUrl ?? null,
        };
      }

      if (Object.keys(idx).length) {
        mediaIndexCache = idx;
        return idx;
      }
    }

    mediaIndexCache = {};
    return {};
  })().finally(() => {
    mediaIndexInFlight = null;
  });

  return mediaIndexInFlight;
}

function toDurationMs(x: any): number | undefined {
  if (x?.durationMs != null) return Number(x.durationMs);
  if (x?.durationSec != null) return Math.max(0, Number(x.durationSec)) * 1000;
  if (x?.duration != null) return Math.max(0, Number(x.duration)) * 1000;
  return undefined;
}

function normalizeZoneItems(raw: unknown, mediaIndex: Record<string, MediaRow>): VsPlaylistItem[] {
  let arr: any[] = [];

  if (Array.isArray(raw)) arr = raw as any[];
  else if (raw && typeof raw === "object") arr = Object.values(raw as Record<string, unknown>) as any[];

  return arr
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      // CASE A: already resolved
      if (
        typeof (x as any).id === "string" &&
        ((x as any).type === "image" || (x as any).type === "video") &&
        typeof (x as any).url === "string"
      ) {
        return {
          id: String((x as any).id),
          type: (x as any).type as "image" | "video",
          url: String((x as any).url),
          order: Number((x as any).order ?? 0),
          durationMs: toDurationMs(x),
          schedules: Array.isArray((x as any).schedules) ? (x as any).schedules : undefined,
          schedule: (x as any).schedule ?? undefined,
          transitionType: (x as any).transitionType ?? (x as any).transition ?? undefined,
          transitionMs: (x as any).transitionMs != null ? Number((x as any).transitionMs) : undefined,
        } as VsPlaylistItem;
      }

      // CASE B: ChannelZoneItem shape
      const st = String((x as any).sourceType ?? "").toUpperCase();
      if (st !== "MEDIA") return null;

      const sourceId = (x as any).sourceId ? String((x as any).sourceId) : "";
      const clientId = (x as any).clientId ? String((x as any).clientId) : sourceId;
      const m = sourceId ? mediaIndex[sourceId] : undefined;

      if (!m?.url || (m.type !== "image" && m.type !== "video")) return null;

      return {
        id: clientId,
        type: m.type,
        url: m.url,
        order: Number((x as any).order ?? 0),
        durationMs: toDurationMs(x),
        schedules: Array.isArray((x as any).schedules)
          ? (x as any).schedules
          : (x as any).schedule
            ? [(x as any).schedule]
            : undefined,
        schedule: (x as any).schedule ?? undefined,
        transitionType: (x as any).transitionType ?? (x as any).transition ?? undefined,
        transitionMs: (x as any).transitionMs != null ? Number((x as any).transitionMs) : undefined,
      } as VsPlaylistItem;
    })
    .filter((x): x is VsPlaylistItem => x !== null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function preloadImage(url: string, timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    if (!url) return resolve();
    const img = new Image();
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    const t = window.setTimeout(finish, timeoutMs);

    img.onload = () => {
      window.clearTimeout(t);
      finish();
    };
    img.onerror = () => {
      window.clearTimeout(t);
      finish();
    };

    img.src = url;
  });
}

function preloadVideo(url: string, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    if (!url) return resolve();

    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        v.removeAttribute("src");
        v.load();
      } catch {}
      resolve();
    };

    const t = window.setTimeout(finish, timeoutMs);
    const onDone = () => {
      window.clearTimeout(t);
      finish();
    };

    v.addEventListener("loadeddata", onDone, { once: true });
    v.addEventListener("canplay", onDone, { once: true });
    v.addEventListener("error", onDone, { once: true });

    v.src = url;
    try {
      v.load();
    } catch {
      onDone();
    }
  });
}

function normalizeTransitionType(t?: string | null) {
  const x = String(t ?? "").trim().toLowerCase();
  if (x === "fade" || x === "slide" || x === "push" || x === "wipe" || x === "zoom") return x;
  return DEFAULT_TRANSITION_TYPE;
}

function transitionMsFromChannel(tr?: ChannelTransition) {
  const ms =
    tr?.durationMs != null
      ? Number(tr.durationMs)
      : tr?.durationSec != null
        ? Math.round(Number(tr.durationSec) * 1000)
        : (tr as any)?.duration != null
          ? Math.round(Number((tr as any).duration) * 1000)
          : undefined;

  return Number.isFinite(ms) ? Math.max(0, ms as number) : DEFAULT_TRANSITION_MS;
}

export default function VirtualScreenPage(props?: { embed?: boolean; pairingCode?: string }) {
  const embed = !!props?.embed;
  const forcedCode = props?.pairingCode?.trim().toUpperCase() || "";

  const lastStateUpdatedAtRef = useRef<number>(-1);
  const lastPlaylistUpdatedAtRef = useRef<number>(-1);

  const params = useParams();
  const sessionId = useMemo(() => {
    const anyParams = params as Record<string, string | undefined>;
    return String(anyParams.code ?? anyParams.id ?? anyParams.sessionId ?? "").trim();
  }, [params]);

  const qrValue = useMemo(() => {
    try {
      return window.location.href;
    } catch {
      return "";
    }
  }, []);

  // Room scaling (non-embed only)
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    if (embed) return;

    const calc = () => {
      const vv = window.visualViewport;
      const vw = vv?.width ?? window.innerWidth;
      const vh = vv?.height ?? window.innerHeight;

      const s = Math.max(vw / DESIGN_W, vh / DESIGN_H);
      setScale(Number.isFinite(s) && s > 0 ? s : 1);
    };

    calc();
    window.addEventListener("resize", calc);
    window.visualViewport?.addEventListener("resize", calc);
    window.visualViewport?.addEventListener("scroll", calc);

    return () => {
      window.removeEventListener("resize", calc);
      window.visualViewport?.removeEventListener("resize", calc);
      window.visualViewport?.removeEventListener("scroll", calc);
    };
  }, [embed]);

  const [pairingCode, setPairingCode] = useState<string>("");
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [vsState, setVsState] = useState<VsStatePayload | null>(null);
  const [vsPlaylist, setVsPlaylist] = useState<VsPlaylistPayload | null>(null);

  const sockRef = useRef<Socket | null>(null);

  // Playback state
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<number | null>(null);
  const [refreshSeq, setRefreshSeq] = useState(0);

  const soundEnabled = true;

  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem("ns2:vs-audio-unlocked") === "1";
    } catch {
      return false;
    }
  });

  const [needsAudioClick, setNeedsAudioClick] = useState<boolean>(false);
  const [forceMuted, setForceMuted] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const lastProgressAtRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Channel playback state
  const zoneTimersRef = useRef<Record<string, number>>({});
  const [zoneIdx, setZoneIdx] = useState<Record<string, number>>({});
  const zoneIdxRef = useRef<Record<string, number>>({});
  useEffect(() => {
    zoneIdxRef.current = zoneIdx;
  }, [zoneIdx]);

  const [zoneActiveLayer, setZoneActiveLayer] = useState<Record<string, "a" | "b">>({});
  const zoneActiveLayerRef = useRef<Record<string, "a" | "b">>({});
  useEffect(() => {
    zoneActiveLayerRef.current = zoneActiveLayer;
  }, [zoneActiveLayer]);

  const [zoneSwap, setZoneSwap] = useState<Record<string, boolean>>({});
  const [zoneLayerIdx, setZoneLayerIdx] = useState<Record<string, { a: number; b: number }>>({});

  const zonePendingAdvanceRef = useRef<Record<string, boolean>>({});
  const zoneTimerItemRef = useRef<Record<string, string>>({});

  const channel = vsPlaylist?.channel;
  const channelTransition: ChannelTransition = (channel as any)?.transition ?? null;

  const hasChannel = !!channel?.layoutId && !!channel?.zones && Object.keys(channel.zones).length > 0;
  const legacyItems = vsPlaylist?.items ?? [];
  const items = hasChannel ? [] : legacyItems;

  const playingLegacy = vsState?.state === "PLAYING" && items.length > 0;
  const playingChannel = vsState?.state === "PLAYING" && hasChannel;
  const isPlaying = (playingLegacy && items.length > 0) || playingChannel;

  // ===== Schedules tick
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Load media index only if channel exists
  const [mediaIndex, setMediaIndex] = useState<Record<string, MediaRow>>({});
  useEffect(() => {
    let cancelled = false;
    if (!hasChannel) return;

    (async () => {
      const idx2 = await ensureMediaIndex().catch(() => ({}));
      if (!cancelled) setMediaIndex(idx2);
    })();

    return () => {
      cancelled = true;
    };
  }, [hasChannel]);

  // ===== Session bootstrap
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setSessionError(null);
      setPairingCode("");
      setVsState(null);
      setVsPlaylist(null);

      if (forcedCode) {
        if (!cancelled) setPairingCode(forcedCode);
        return;
      }

      if (!sessionId) {
        setSessionError("Missing virtual session id.");
        return;
      }

      const res = await fetch(`/api/screens/virtual-session/${encodeURIComponent(sessionId)}`, {
        credentials: "include",
      });

      if (!res.ok) {
        const txt = await res.text();
        if (!cancelled) setSessionError(txt || "Virtual session not found");
        return;
      }

      const data = (await res.json()) as { id: string; code: string };
      const code = String(data.code ?? "").trim().toUpperCase();
      if (!cancelled) setPairingCode(code);
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, forcedCode]);

  // Mark tab open (virtual-only)
  useEffect(() => {
    if (!pairingCode || embed) return;

    lastStateUpdatedAtRef.current = -1;
    lastPlaylistUpdatedAtRef.current = -1;

    const key = openKey(pairingCode);
    const write = () => {
      try {
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), sessionId }));
      } catch {}
    };

    write();
    const t = window.setInterval(write, 4000);

    return () => {
      window.clearInterval(t);
      try {
        localStorage.removeItem(key);
      } catch {}
    };
  }, [pairingCode, sessionId, embed]);

  // ===== Socket (role=device in embed)
  useEffect(() => {
    if (!pairingCode) return;

    const s = io("/virtual-screen", {
      path: "/ws",
      withCredentials: true,
      transports: ["websocket", "polling"],
      query: { code: pairingCode, role: embed ? "device" : "virtual" },
    });

    sockRef.current = s;

    const onState = (p: VsStatePayload) => {
      if (!p || String(p.code ?? "").toUpperCase() !== pairingCode) return;
      const ua = Number(p.updatedAt ?? 0);
      if (ua === lastStateUpdatedAtRef.current) return;
      lastStateUpdatedAtRef.current = ua;
      setVsState(p);
    };

    const onPlaylist = (p: VsPlaylistPayload) => {
      if (!p || String(p.code ?? "").toUpperCase() !== pairingCode) return;
      const ua = Number(p.updatedAt ?? 0);
      if (ua === lastPlaylistUpdatedAtRef.current) return;
      lastPlaylistUpdatedAtRef.current = ua;
      setVsPlaylist(p);
    };

    const onBundle = (b: { state?: VsStatePayload; playlist?: VsPlaylistPayload }) => {
      if (b?.state) onState(b.state);
      if (b?.playlist) onPlaylist(b.playlist);
    };

    const onRefresh = (evt: { code?: string; ts?: number }) => {
      if (!evt || String(evt.code ?? "").toUpperCase() !== pairingCode) return;
      setIdx(0);
      setZoneIdx({});
      setZoneActiveLayer({});
      setZoneSwap({});
      setZoneLayerIdx({});
      setRefreshSeq(Date.now());
    };

    s.on("vs:state", onState);
    s.on("vs:playlist", onPlaylist);
    s.on("vs:bundle", onBundle);
    s.on("vs:refresh", onRefresh);

    const ping = () => s.emit("vs:ping", { code: pairingCode });
    ping();
    const t = window.setInterval(ping, 5000);

    return () => {
      window.clearInterval(t);
      s.disconnect();
      sockRef.current = null;
    };
  }, [pairingCode, embed]);

  // Reset legacy index when items change
  useEffect(() => {
    setIdx(0);
  }, [vsPlaylist?.playlistId, items.length]);

  const currentItem = playingLegacy ? items[idx % items.length] : null;

  const mediaUrl = useMemo(() => {
    if (!currentItem?.url) return "";
    const u = String(currentItem.url);
    const sep = u.includes("?") ? "&" : "?";
    if (!refreshSeq) return u;
    return `${u}${sep}r=${encodeURIComponent(String(refreshSeq))}`;
  }, [currentItem?.url, refreshSeq]);

  const advance = () => {
    if (!items.length) return;
    setIdx((p) => (p + 1) % items.length);
  };

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!playingLegacy) return;
    const cur = currentItem;
    if (!cur) return;

    if (cur.type === "image") {
      const ms = Number(cur.durationMs ?? 5000);
      timerRef.current = window.setTimeout(() => advance(), Math.max(500, ms));
    }

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playingLegacy, currentItem?.id, items.length]);

  useEffect(() => {
    if (!playingLegacy || currentItem?.type !== "video") return;

    const v = videoRef.current;
    if (!v) return;

    lastProgressAtRef.current = Date.now();
    lastTimeRef.current = 0;
    setNeedsAudioClick(false);

    setForceMuted(false);
    v.muted = !(soundEnabled && audioUnlocked);

    const tryStart = async () => {
      try {
        await v.play();
      } catch {
        setForceMuted(true);
        setNeedsAudioClick(true);
        try {
          v.muted = true;
          await v.play();
        } catch {
          setNeedsAudioClick(true);
        }
      }
    };

    tryStart();

    const onTimeUpdate = () => {
      const t = Number(v.currentTime || 0);
      if (t > lastTimeRef.current + 0.05) {
        lastTimeRef.current = t;
        lastProgressAtRef.current = Date.now();
      }
    };

    const onErrorOrAbort = () => {
      window.setTimeout(() => advance(), 400);
    };

    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("error", onErrorOrAbort);
    v.addEventListener("abort", onErrorOrAbort);
    v.addEventListener("stalled", onErrorOrAbort);

    const watchdog = window.setInterval(() => {
      const vv = videoRef.current;
      if (!vv) return;
      if (vv.ended) return;

      const now = Date.now();
      const noProgressFor = now - (lastProgressAtRef.current || now);
      if (noProgressFor >= 6000) advance();
    }, 1000);

    return () => {
      window.clearInterval(watchdog);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("error", onErrorOrAbort);
      v.removeEventListener("abort", onErrorOrAbort);
      v.removeEventListener("stalled", onErrorOrAbort);
    };
  }, [playingLegacy, currentItem?.id, refreshSeq, audioUnlocked]);

  // ===== Channel layout lookup
  const layoutDef = useMemo(() => {
    const layoutId = channel?.layoutId ? String(channel.layoutId) : "";
    if (!layoutId) return null;

    return (
      (ALL_LAYOUTS as any[]).find((l: any) => String(l?.id ?? "") === layoutId) ??
      (ALL_LAYOUTS as any[]).find((l: any) => String(l?.layoutId ?? "") === layoutId) ??
      null
    );
  }, [channel?.layoutId]);

  // Convert layout coords to %
  function toPctAxis(v: unknown, axis: "x" | "y", designW: number, designH: number) {
    const n = Number((v as any) ?? 0);
    if (!Number.isFinite(n)) return 0;

    if (n >= 0 && n <= 1) return n * 100;
    if (n >= 0 && n <= 100) return n;

    const denom = axis === "x" ? designW : designH;
    return (n / denom) * 100;
  }

  const channelOrientation = String((channel as any)?.orientation ?? "landscape");
  const layoutDesignW = channelOrientation === "portrait" ? 1080 : 1920;
  const layoutDesignH = channelOrientation === "portrait" ? 1920 : 1080;

  const zoneRects = useMemo<ZoneRect[]>(() => {
    if (!layoutDef) return [];
    const zones = (layoutDef as any)?.zones;
    if (!Array.isArray(zones)) return [];

    return zones
      .map((z: any): ZoneRect | null => {
        const id = String(z?.id ?? z?.zoneId ?? "");
        if (!id) return null;

        const x = z?.x ?? z?.left ?? 0;
        const y = z?.y ?? z?.top ?? 0;
        const w = z?.w ?? z?.width ?? 0;
        const h = z?.h ?? z?.height ?? 0;

        const leftPct = clampPct(toPctAxis(x, "x", layoutDesignW, layoutDesignH));
        const topPct = clampPct(toPctAxis(y, "y", layoutDesignW, layoutDesignH));
        const widthPct = clampPct(toPctAxis(w, "x", layoutDesignW, layoutDesignH));
        const heightPct = clampPct(toPctAxis(h, "y", layoutDesignW, layoutDesignH));

        if (widthPct <= 0 || heightPct <= 0) return null;
        return { id, leftPct, topPct, widthPct, heightPct };
      })
      .filter((x: ZoneRect | null): x is ZoneRect => !!x);
  }, [layoutDef, layoutDesignW, layoutDesignH]);

  const withRefresh = useCallback(
    (url: string) => {
      const u = String(url || "");
      if (!u) return "";
      const sep = u.includes("?") ? "&" : "?";
      return `${u}${sep}r=${encodeURIComponent(String(refreshSeq || 0))}`;
    },
    [refreshSeq]
  );

  // Normalize channel zones + schedule filter
  const zoneItemsMap = useMemo(() => {
    const rawZones = channel?.zones ?? {};
    const map: Record<string, VsPlaylistItem[]> = {};
    const now = new Date(nowTick || Date.now());

    for (const zr of zoneRects) {
      const rawZone = (rawZones as any)[zr.id];
      const zoneItems = normalizeZoneItems(rawZone, mediaIndex);

      const active = zoneItems.filter((it) => {
        let schedules: any[] = [];
        try {
          schedules = (ensureSchedules(it as any) as any[])?.filter(Boolean) ?? [];
        } catch {
          schedules = [];
        }
        if (!schedules.length) return true;
        try {
          return schedules.some((s) => isScheduleActive(s, now));
        } catch {
          return true;
        }
      });

      map[zr.id] = active;
    }

    return map;
  }, [channel?.zones, zoneRects, nowTick, mediaIndex]);

  const zoneItemsMapRef = useRef<Record<string, VsPlaylistItem[]>>({});
  useEffect(() => {
    zoneItemsMapRef.current = zoneItemsMap;
  }, [zoneItemsMap]);

  const zoneListSig = useMemo(() => {
    const keys = Object.keys(zoneItemsMap).sort();
    const parts = keys.map((k) => {
      const arr = zoneItemsMap[k] ?? [];
      const ids = arr.map((x) => x.id).join(",");
      return `${k}:${arr.length}:${ids}`;
    });
    return parts.join("|");
  }, [zoneItemsMap]);

  const fullscreen = useMemo(() => {
    const now = new Date(nowTick || Date.now());
    return pickFullscreenOverride(zoneItemsMap as any, now) as { zoneId: string; item: VsPlaylistItem } | null;
  }, [zoneItemsMap, nowTick]);

  const channelSig = useMemo(() => {
    const cid = channel?.channelId ?? "";
    const lid = channel?.layoutId ?? "";
    const ua = vsPlaylist?.updatedAt ?? 0;
    return `${cid}|${lid}|${ua}|${refreshSeq}`;
  }, [channel?.channelId, channel?.layoutId, vsPlaylist?.updatedAt, refreshSeq]);

  useEffect(() => {
    for (const k of Object.keys(zoneTimersRef.current)) window.clearTimeout(zoneTimersRef.current[k]);
    zoneTimersRef.current = {};

    if (!playingChannel) return;

    const zoneKeys = Object.keys(zoneItemsMap);

    setZoneIdx(() => {
      const next: Record<string, number> = {};
      for (const zid of zoneKeys) next[zid] = 0;
      return next;
    });

    setZoneActiveLayer(() => {
      const next: Record<string, "a" | "b"> = {};
      for (const zid of zoneKeys) next[zid] = "a";
      return next;
    });

    setZoneSwap(() => {
      const next: Record<string, boolean> = {};
      for (const zid of zoneKeys) next[zid] = false;
      return next;
    });

    setZoneLayerIdx(() => {
      const next: Record<string, { a: number; b: number }> = {};
      for (const zid of zoneKeys) {
        const len = (zoneItemsMap[zid] ?? []).length;
        next[zid] = { a: 0, b: len > 1 ? 1 : 0 };
      }
      return next;
    });

    zonePendingAdvanceRef.current = {};
    zoneTimerItemRef.current = {};

    return () => {
      for (const k of Object.keys(zoneTimersRef.current)) window.clearTimeout(zoneTimersRef.current[k]);
      zoneTimersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingChannel, channelSig]);

  useEffect(() => {
    if (!playingChannel) return;

    setZoneIdx((prev) => {
      const next = { ...prev };
      for (const zid of Object.keys(zoneItemsMap)) {
        const len = (zoneItemsMap[zid] ?? []).length;
        if (!len) {
          next[zid] = 0;
          continue;
        }
        const cur = next[zid] ?? 0;
        next[zid] = ((cur % len) + len) % len;
      }
      return next;
    });

    setZoneLayerIdx((prev) => {
      const next = { ...prev };
      for (const zid of Object.keys(zoneItemsMap)) {
        const arr = zoneItemsMap[zid] ?? [];
        const len = arr.length;
        if (!len) {
          next[zid] = { a: 0, b: 0 };
          continue;
        }
        const curIdx = (zoneIdxRef.current[zid] ?? 0) % len;
        const li = next[zid] ?? { a: curIdx, b: (curIdx + 1) % len };
        const a = ((li.a ?? curIdx) % len + len) % len;
        const b = ((li.b ?? (curIdx + 1)) % len + len) % len;
        next[zid] = { a, b: len > 1 ? b : a };
      }
      return next;
    });

    setZoneActiveLayer((prev) => {
      const next = { ...prev };
      for (const zid of Object.keys(zoneItemsMap)) if (!next[zid]) next[zid] = "a";
      return next;
    });

    setZoneSwap((prev) => {
      const next = { ...prev };
      for (const zid of Object.keys(zoneItemsMap)) if (next[zid] == null) next[zid] = false;
      return next;
    });

    for (const zid of Object.keys(zonePendingAdvanceRef.current)) {
      if (!(zid in zoneItemsMap)) delete zonePendingAdvanceRef.current[zid];
    }
  }, [zoneListSig, playingChannel]);

  useEffect(() => {
    if (!playingChannel) return;

    (async () => {
      for (const zid of Object.keys(zoneItemsMap)) {
        const arr = zoneItemsMap[zid] ?? [];
        if (!arr.length) continue;

        const a = arr[0];
        const b = arr.length > 1 ? arr[1] : null;

        const ua = withRefresh(a.url);
        if (a.type === "image") await preloadImage(ua);
        else await preloadVideo(ua);

        if (b) {
          const ub = withRefresh(b.url);
          if (b.type === "image") await preloadImage(ub);
          else await preloadVideo(ub);
        }
      }
    })();
  }, [playingChannel, zoneListSig, withRefresh, zoneItemsMap]);

  const getTransType = useCallback(
    (zid: string) => {
      const arr = zoneItemsMapRef.current[zid] ?? [];
      const len = arr.length;
      const cur = len ? arr[(zoneIdxRef.current[zid] ?? 0) % len] : null;
      const itemType = cur?.transitionType ? normalizeTransitionType(cur.transitionType) : null;

      const chEnabled = channelTransition?.enabled ?? true;
      if (!chEnabled) return "cut";

      const chType = normalizeTransitionType(channelTransition?.type ?? DEFAULT_TRANSITION_TYPE);
      return itemType ?? chType ?? DEFAULT_TRANSITION_TYPE;
    },
    [channelTransition]
  );

  const getTransMs = useCallback(
    (zid: string) => {
      const arr = zoneItemsMapRef.current[zid] ?? [];
      const len = arr.length;
      const cur = len ? arr[(zoneIdxRef.current[zid] ?? 0) % len] : null;
      const itemMs = cur?.transitionMs != null ? Number(cur.transitionMs) : undefined;

      if (itemMs != null && Number.isFinite(itemMs)) return Math.max(0, itemMs);
      return transitionMsFromChannel(channelTransition);
    },
    [channelTransition]
  );

  const requestAdvance = useCallback(
    async (zid: string) => {
      const arr = zoneItemsMapRef.current[zid] ?? [];
      const len = arr.length;
      if (len <= 1) return;

      if (zonePendingAdvanceRef.current[zid]) return;
      zonePendingAdvanceRef.current[zid] = true;

      try {
        const curIdx = (zoneIdxRef.current[zid] ?? 0) % len;
        const nextIdx = (curIdx + 1) % len;

        const active = zoneActiveLayerRef.current[zid] ?? "a";
        const inactive: "a" | "b" = active === "a" ? "b" : "a";

        setZoneLayerIdx((prev) => {
          const cur = prev[zid] ?? { a: curIdx, b: nextIdx };
          return { ...prev, [zid]: { ...cur, [inactive]: nextIdx } };
        });

        const nextItem = arr[nextIdx];
        const nextUrl = withRefresh(nextItem.url);

        if (nextItem.type === "image") await preloadImage(nextUrl);
        else await preloadVideo(nextUrl);

        const tType = getTransType(zid);
        const msRaw = getTransMs(zid);
        const transMs = tType === "cut" ? 0 : Math.max(0, Number(msRaw ?? DEFAULT_TRANSITION_MS));

        if (transMs <= 0) {
          setZoneIdx((p) => ({ ...p, [zid]: nextIdx }));
          setZoneActiveLayer((p) => ({ ...p, [zid]: inactive }));
          setZoneSwap((p) => ({ ...p, [zid]: false }));
          zonePendingAdvanceRef.current[zid] = false;
          return;
        }

        setZoneSwap((p) => ({ ...p, [zid]: true }));

        window.setTimeout(() => {
          setZoneIdx((p) => ({ ...p, [zid]: nextIdx }));
          setZoneActiveLayer((p) => ({ ...p, [zid]: inactive }));
          setZoneSwap((p) => ({ ...p, [zid]: false }));
          zonePendingAdvanceRef.current[zid] = false;
        }, transMs);
      } catch {
        zonePendingAdvanceRef.current[zid] = false;
      }
    },
    [getTransMs, getTransType, withRefresh]
  );

  useEffect(() => {
    if (!playingChannel) return;

    const map = zoneItemsMapRef.current;

    for (const zid of Object.keys(map)) {
      const zoneItems = map[zid] ?? [];

      if (zoneItems.length <= 1) {
        if (zoneTimersRef.current[zid]) {
          window.clearTimeout(zoneTimersRef.current[zid]);
          delete zoneTimersRef.current[zid];
        }
        zoneTimerItemRef.current[zid] = "";
        continue;
      }

      const zi = (zoneIdxRef.current[zid] ?? 0) % zoneItems.length;
      const cur = zoneItems[zi];
      if (!cur) continue;

      if (cur.type !== "image") {
        if (zoneTimersRef.current[zid]) {
          window.clearTimeout(zoneTimersRef.current[zid]);
          delete zoneTimersRef.current[zid];
        }
        zoneTimerItemRef.current[zid] = cur.id;
        continue;
      }

      if (zoneTimerItemRef.current[zid] === cur.id && zoneTimersRef.current[zid]) continue;

      if (zoneTimersRef.current[zid]) {
        window.clearTimeout(zoneTimersRef.current[zid]);
        delete zoneTimersRef.current[zid];
      }

      zoneTimerItemRef.current[zid] = cur.id;

      const ms = Math.max(500, Number(cur.durationMs ?? 5000));
      zoneTimersRef.current[zid] = window.setTimeout(() => {
        void requestAdvance(zid);
      }, ms);
    }
  }, [playingChannel, zoneListSig, channelSig, requestAdvance]);

  // ===== Adaptive rotation + COVER scale (kills letterboxing) =====
const playerRef = useRef<HTMLDivElement | null>(null);
const [playerBox, setPlayerBox] = useState({ w: 1, h: 1 });

// measure the real visible box
useLayoutEffect(() => {
  const el = playerRef.current;
  if (!el) return;

  let raf = 0;

  const measure = () => {
    const r = el.getBoundingClientRect();
    setPlayerBox({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
  };

  const schedule = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(measure);
  };

  measure();
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  window.visualViewport?.addEventListener("resize", schedule);
  window.visualViewport?.addEventListener("scroll", schedule);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    window.visualViewport?.removeEventListener("resize", schedule);
    window.visualViewport?.removeEventListener("scroll", schedule);
  };
}, [embed, scale, isPlaying, vsState?.orientation]);

const screenOrientation = ((vsState as any)?.orientation ?? "LANDSCAPE") as ScreenOrientation4;
const desiredBase: "landscape" | "portrait" = String(screenOrientation).startsWith("PORTRAIT") ? "portrait" : "landscape";
const isFlipped = String(screenOrientation).endsWith("_FLIPPED");

// what the viewport currently is
const viewportBase: "landscape" | "portrait" = playerBox.w >= playerBox.h ? "landscape" : "portrait";

// rotate ONLY if viewport base != desired base
const baseRot = viewportBase === desiredBase ? 0 : desiredBase === "portrait" ? 90 : 270;
const rotDeg = (baseRot + (isFlipped ? 180 : 0)) % 360;

// design canvas
const contentDesignW = desiredBase === "portrait" ? 1080 : 1920;
const contentDesignH = desiredBase === "portrait" ? 1920 : 1080;

// bounding box after rotation
const swap = rotDeg % 180 !== 0;
const rotW = swap ? contentDesignH : contentDesignW;
const rotH = swap ? contentDesignW : contentDesignH;

// ✅ COVER (no borders). Overscan removes 1px gaps
const s = Math.max(playerBox.w / rotW, playerBox.h / rotH) * 1.02;

const stageStyle = useMemo<React.CSSProperties>(() => {
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: `${contentDesignW}px`,
    height: `${contentDesignH}px`,
    transformOrigin: "center center",
    transform: `translate(-50%, -50%) rotate(${rotDeg}deg) scale(${s})`,
    overflow: "hidden",
  };
}, [contentDesignW, contentDesignH, rotDeg, s]);

  const codeForUi = pairingCode || "— — — — —";

  const emptyPlaylistMsg =
    vsState?.state === "PLAYING" && !playingLegacy && !playingChannel ? "Playlist/channel is empty. Upload content to play." : null;

  const tvClass = `vs-tv ${(playingLegacy && currentItem) || playingChannel ? "vs-tv--media" : ""}`;

  // HARD FORCE fill styles (do NOT rely on CSS classes)
  const videoFillStyle = useMemo<React.CSSProperties>(
    () => ({
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      minWidth: "100%",
      minHeight: "100%",
      objectFit: "fill",
      display: "block",
      backgroundColor: "#000",
    }),
    []
  );

  const bgFillBase = useMemo<React.CSSProperties>(
    () => ({
      position: "absolute",
      inset: 0,
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundSize: "100% 100%",
    }),
    []
  );

  const renderImageFill = (url: string, key: string) => {
    const src = withRefresh(url);
    return <div key={key} style={{ ...bgFillBase, backgroundImage: `url("${src}")` }} />;
  };

  // Shared renderer used by BOTH embed and non-embed
  const renderPlayback = () => {
    if (!isPlaying) return null;

    // CHANNEL
    if (playingChannel && channel && layoutDef && zoneRects.length > 0) {
      if (fullscreen) {
        const fsItem = fullscreen?.item;
        if (!fsItem || !isVsPlaylistItem(fsItem)) return null;

        return (
          <div className="vs-zoneStage" style={{ position: "absolute", inset: 0 }}>
            <div className="vs-zone" style={{ left: "0%", top: "0%", width: "100%", height: "100%", overflow: "hidden" }}>
              {fsItem.type === "video" ? (
                <video
                  key={`fs-${fsItem.id}-${refreshSeq}`}
                  style={videoFillStyle}
                  src={withRefresh(fsItem.url)}
                  autoPlay
                  playsInline
                  preload="auto"
                  muted={!(soundEnabled && audioUnlocked)}
                  controls={false}
                  loop
                />
              ) : (
                renderImageFill(fsItem.url, `fsimg-${fsItem.id}-${refreshSeq}`)
              )}
            </div>
          </div>
        );
      }

      return (
        <div className="vs-zoneStage" style={{ position: "absolute", inset: 0 }}>
          {zoneRects.map((z: ZoneRect) => {
            const arr = zoneItemsMap[z.id] ?? [];
            if (!arr.length) return null;

            const li = zoneLayerIdx[z.id] ?? { a: 0, b: Math.min(1, arr.length - 1) };
            const itemA = arr[(li.a ?? 0) % arr.length];
            const itemB = arr[(li.b ?? 0) % arr.length];
            if (!itemA?.url || !itemB?.url) return null;

            const activeLayer = zoneActiveLayer[z.id] ?? "a";
            const swapNow = !!zoneSwap[z.id];

            const bump = () => void requestAdvance(z.id);

            const tType = getTransType(z.id);
            const tMs = getTransMs(z.id);

            return (
              <div
                key={z.id}
                className={`vs-zone ${swapNow ? "vs-swap" : ""} ${tType ? `vs-trans-${tType}` : ""}`}
                data-active={activeLayer}
                style={{
                  left: `${z.leftPct}%`,
                  top: `${z.topPct}%`,
                  width: `${z.widthPct}%`,
                  height: `${z.heightPct}%`,
                  overflow: "hidden",
                  ["--vs-trans-ms" as any]: `${tMs}ms`,
                  ["--vs-dir" as any]: String(channelTransition?.direction ?? "Right"),
                  ["--vs-easing" as any]: String(channelTransition?.easing ?? "ease-in-out"),
                  ["--vs-fade" as any]: String(channelTransition?.fadeColor ?? "#000000"),
                  ["--vs-zoom" as any]: String(channelTransition?.zoom ?? "in"),
                  ["--vs-start-scale" as any]: String(channelTransition?.startScale ?? 0.9),
                }}
              >
                <div className="vs-layer layer-a" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                  {itemA.type === "video" ? (
                    <video
                      key={`a-${z.id}-${itemA.id}-${refreshSeq}`}
                      style={videoFillStyle}
                      src={withRefresh(itemA.url)}
                      autoPlay
                      playsInline
                      preload="auto"
                      muted={!(soundEnabled && audioUnlocked)}
                      controls={false}
                      loop={arr.length === 1}
                      onEnded={arr.length === 1 ? undefined : bump}
                      onError={arr.length === 1 ? undefined : bump}
                      onAbort={arr.length === 1 ? undefined : bump}
                      onStalled={arr.length === 1 ? undefined : bump}
                    />
                  ) : (
                    renderImageFill(itemA.url, `aimg-${z.id}-${itemA.id}-${refreshSeq}`)
                  )}
                </div>

                <div className="vs-layer layer-b" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                  {itemB.type === "video" ? (
                    <video
                      key={`b-${z.id}-${itemB.id}-${refreshSeq}`}
                      style={videoFillStyle}
                      src={withRefresh(itemB.url)}
                      autoPlay
                      playsInline
                      preload="auto"
                      muted={!(soundEnabled && audioUnlocked)}
                      controls={false}
                      loop={false}
                      onEnded={bump}
                      onError={bump}
                      onAbort={bump}
                      onStalled={bump}
                    />
                  ) : (
                    renderImageFill(itemB.url, `bimg-${z.id}-${itemB.id}-${refreshSeq}`)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // LEGACY FULLSCREEN
    if (currentItem?.type === "video") {
      return (
        <div className="vs-videoWrap" style={{ position: "absolute", inset: 0 }}>
          <video
            ref={videoRef}
            key={`${currentItem.id}-${refreshSeq}`}
            style={videoFillStyle}
            src={mediaUrl}
            autoPlay
            playsInline
            preload="auto"
            muted={forceMuted || !(soundEnabled && audioUnlocked)}
            controls={false}
            loop={items.length === 1}
            onEnded={items.length === 1 ? undefined : advance}
            onError={advance}
          />

          {!audioUnlocked && needsAudioClick && (
            <button
              type="button"
              className="vs-soundCta"
              onClick={async () => {
                setNeedsAudioClick(false);
                setForceMuted(false);
                setAudioUnlocked(true);
                try {
                  localStorage.setItem("ns2:vs-audio-unlocked", "1");
                } catch {}

                const v = videoRef.current;
                if (v) {
                  v.muted = false;
                  try {
                    await v.play();
                  } catch {
                    setNeedsAudioClick(true);
                  }
                }
              }}
            >
              Enable sound
            </button>
          )}
        </div>
      );
    }

    if (currentItem?.type === "image" && currentItem.url) {
      return renderImageFill(currentItem.url, `legacyimg-${currentItem.id}-${refreshSeq}`);
    }

    return null;
  };

  const playerCommonStyle: React.CSSProperties = { position: "relative", width: "100%", height: "100%", overflow: "hidden" };
  const frameCommonStyle: React.CSSProperties = { position: "absolute", inset: 0, overflow: "hidden" };

  if (embed) {
    return (
      <div className="vs-root vs-embed">
        <div ref={playerRef} className="vs-player vs-player--embed" style={playerCommonStyle}>
          <div className="vs-contentFrame" style={frameCommonStyle}>
            <div className="vs-contentStage" style={stageStyle}>
              {renderPlayback()}
            </div>
          </div>

          {!isPlaying && (
            <div className="vs-embedOverlay">
              <div className="vs-embedTitle">{vsState?.state === "WAITING" ? "Paired" : "Pair this device"}</div>
              <div className="vs-embedCode">{codeForUi}</div>
              <div className="vs-embedHint">Dashboard → Screens → Pair screen → enter this code</div>

              <div className="vs-embedStatus">
                {sessionError ? (
                  <span className="vs-embedErr">{sessionError}</span>
                ) : emptyPlaylistMsg ? (
                  <span>{emptyPlaylistMsg}</span>
                ) : vsState?.state === "WAITING" ? (
                  <span>Waiting for content assignment…</span>
                ) : (
                  <span>Waiting for pairing…</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="vs-root">
      <div className="vs-canvas" style={{ ["--vs-scale" as any]: scale }}>
        <div className="vs-bg" aria-hidden />

        <div className={tvClass}>
          {isPlaying ? (
            <div ref={playerRef} className="vs-player" style={playerCommonStyle}>
              <div className="vs-contentFrame" style={frameCommonStyle}>
                <div className="vs-contentStage" style={stageStyle}>
                  {renderPlayback()}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="vs-tv-left">
                <div className="vs-title">Pair device</div>

                <ol className="vs-steps">
                  <li>
                    Log in to your <strong>Novasign</strong> account.
                  </li>
                  <li>
                    Open <strong>Screens</strong>, click <strong>Pair screen</strong>, and enter this code.
                  </li>
                </ol>

                <div className="vs-code" aria-label="Pairing code">
                  {codeForUi}
                </div>

                <div className="vs-debug">
                  {sessionError ? (
                    <span className="vs-debug-err">{sessionError}</span>
                  ) : emptyPlaylistMsg ? (
                    <span>{emptyPlaylistMsg}</span>
                  ) : vsState?.state === "WAITING" ? (
                    <span>Waiting for content assignment…</span>
                  ) : (
                    <span>Waiting for pairing…</span>
                  )}
                </div>
              </div>

              <div className="vs-tv-right">
                <div className="vs-qrWrap">
                  <div className="vs-qrBox">{qrValue ? <QRCodeSVG value={qrValue} size={220} /> : <div className="vs-qrFallback" />}</div>
                  <div className="vs-qrHint">
                    Or scan this QR code to open this screen
                    <br />
                    and pair it.
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="vs-strip">
          <div className="vs-strip-left">
            <div className="vs-brandMark" aria-hidden>
              N
            </div>
            <div className="vs-stripText">
              <div className="vs-stripTitle">Novasign Virtual Screen</div>
              <div className="vs-stripSub">If you close this tab you can relaunch it from the screens section.</div>
            </div>
          </div>

          <div className="vs-strip-right">
            <div className="vs-stripMeta">
              <div className="vs-metaLabel">Pairing code</div>
              <div className="vs-metaCode">{pairingCode || "—"}</div>
            </div>

            <div className="vs-stripQr">{qrValue ? <QRCodeSVG value={qrValue} size={96} /> : <div className="vs-qrFallbackSmall" />}</div>
          </div>
        </div>
      </div>
    </div>
  );
}