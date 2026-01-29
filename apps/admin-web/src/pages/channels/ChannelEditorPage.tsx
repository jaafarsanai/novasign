// ChannelEditorPage.tsx
// FULL FILE — ScreenCloud-style zone content list + scheduling modal (with safe backend fallbacks)
// Updated:
// 1) Weekly vs Specific date only are now mutually exclusive + switchable back/forth reliably
// 2) "Add" under EVERYDAY now adds a new schedule row (does NOT open modal)
// 3) Multiple schedules per item supported (UI-first; backend persistence attempted, with safe fallback)

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./ChannelEditorPage.css";
import { coverFromSeed, getChannelCoverSeed } from "./channelCover";
import { ALL_LAYOUTS, LayoutDef } from "./layouts/ChannelLayouts";
import ChannelContentPickerModal, { PickerResult } from "./components/ChannelContentPickerModal";

/* -------------------- ZONE CONTENT (types) -------------------- */

type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

type ScheduleTimeWindow = {
  id: string;
  startTime: string; // HH:mm:ss
  endTime: string; // HH:mm:ss
};

type ZoneItemSchedule = {
  id: string; // schedule row id (for multiple schedules per item)

  // ScreenCloud-like:
  mode: "everyday" | "weekly"; // default everyday (all week)
  weeklyDays: Weekday[]; // used when mode=weekly
  dateOnlyEnabled: boolean; // "Specific date only" tab engaged (mutually exclusive with weekly tab)
  dateStart: string | null; // YYYY-MM-DD
  dateEnd: string | null; // YYYY-MM-DD
  timeWindows: ScheduleTimeWindow[]; // optional time windows (applies when dateOnlyEnabled)
  playInFullScreen: boolean;
  priority: boolean;
};

type ZoneContentItem = {
  id: string; // client-side id for local ordering
  sourceType: "media" | "playlist";
  sourceId: string;
  name: string;
  mediaType?: "image" | "video";
  durationSec: number; // images default editable; video should be real and not editable
  order: number;

  // legacy backend fields (keep)
  startAt: string | null;
  endAt: string | null;

  // UI fields (attempt to persist if backend allows; otherwise stripped on fallback)
  thumbnailUrl?: string | null;

  // NEW: multiple schedules per item (UI-first)
  schedules?: ZoneItemSchedule[];

  // legacy single schedule (optional if backend only supports one)
  schedule?: ZoneItemSchedule;
};

/* ------------------------------------------------------------------- */

type Orientation = "landscape" | "portrait";

/**
 * UI Transition model (richer than backend, but we map to backend "transition" on save)
 */
type TransitionMain = "cut" | "fade" | "slide" | "push" | "wipe" | "zoom";
type TransitionDirection = "left" | "right" | "up" | "down";
type TransitionEasing = "linear" | "ease-in-out";
type ZoomMode = "in" | "out";

type ZoneTransition = {
  enabled: boolean;
  type: TransitionMain;
  durationSec: number; // seconds
  color: string; // hex (fade)
  direction?: TransitionDirection; // slide/push/wipe
  easing?: TransitionEasing; // slide
  zoomMode?: ZoomMode; // zoom
  zoomStartScale?: number; // zoom (e.g. 0.9)
};

type ApiChannelTransition = {
  enabled: boolean;
  type: string; // backend examples: "slide"
  duration: number; // seconds
  direction?: string; // e.g. "right"
};

type Channel = {
  id: string;
  name: string;
  orientation: Orientation;
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string;
  layoutId: string;
  transition?: ApiChannelTransition;
  width?: number;
  height?: number;

  zones?: Record<
    string,
    Array<{
      name: string;
      endAt: string | null;
      order: number;
      startAt: string | null;
      sourceId: string;
      mediaType?: "image" | "video";
      sourceType: "media" | "playlist";
      durationSec: number;

      // optional (may exist if backend supports)
      thumbnailUrl?: string | null;

      // single schedule (legacy)
      schedule?: ZoneItemSchedule;

      // multiple schedules (future / optional)
      schedules?: ZoneItemSchedule[];
    }>
  >;
};

type SaveStatus = "idle" | "saving" | "saved" | "noop" | "error";

const API_BASE = "/api/channels";

/** ---------------- Robust fetch helpers ---------------- */

class ApiError extends Error {
  status?: number;
  url?: string;
  bodySnippet?: string;
  constructor(message: string, opts?: { status?: number; url?: string; bodySnippet?: string }) {
    super(message);
    this.name = "ApiError";
    this.status = opts?.status;
    this.url = opts?.url;
    this.bodySnippet = opts?.bodySnippet;
  }
}

function looksLikeHtml(txt: string) {
  const t = txt.trim().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.startsWith("<head") || t.startsWith("<body");
}

async function fetchJsonStrict<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });

  const txt = await res.text().catch(() => "");
  const bodySnippet = txt.length > 220 ? `${txt.slice(0, 220)}…` : txt;

  if (!res.ok) {
    try {
      const parsed = txt ? JSON.parse(txt) : null;
      const msg = (parsed as any)?.message || `${res.status} ${res.statusText}`;
      throw new ApiError(msg, { status: res.status, url, bodySnippet });
    } catch {
      const msg = txt?.trim() ? txt.trim() : `${res.status} ${res.statusText}`;
      throw new ApiError(toggleMsg(msg), { status: res.status, url, bodySnippet });
    }
  }

  if (!txt || !txt.trim()) {
    throw new ApiError("Empty response (expected JSON).", { status: res.status, url });
  }
  if (looksLikeHtml(txt)) {
    throw new ApiError("Received HTML (expected JSON). Wrong route or proxy.", {
      status: res.status,
      url,
      bodySnippet,
    });
  }

  try {
    return JSON.parse(txt) as T;
  } catch (e: any) {
    throw new ApiError(`Invalid JSON response. ${e?.message ?? ""}`.trim(), {
      status: res.status,
      url,
      bodySnippet,
    });
  }
}

// Small helper to prevent accidental undefined/empty message from getting thrown above if edited later.
function toggleMsg(msg: string) {
  return msg || "Request failed";
}

function humanizeError(e: any): string {
  const msg = String(e?.message ?? "Unknown error").trim();

  if (msg.toLowerCase().includes("received html")) return msg;
  if (msg.toLowerCase().includes("cannot patch")) return "PATCH not supported on this API route.";
  if (msg.toLowerCase().includes("cannot put")) return "PUT not supported on this API route.";
  if (msg.toLowerCase().includes("not allowed") || e?.status === 405) return "Method not allowed (405).";

  return msg;
}

function formatBytes(n?: number | null) {
  if (!n || !Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function getBestMediaUrl(it: ZoneContentItem, meta?: MediaMeta) {
  // prefer resolved backend url (for videos especially)
  return meta?.url ?? (it.sourceType === "media" ? meta?.url ?? null : null);
}


function clearNoop(setSaveStatus: React.Dispatch<React.SetStateAction<SaveStatus>>) {
  setSaveStatus((s) => (s === "noop" ? "idle" : s));
}

/** ---------------- UI helpers ---------------- */

function hashToInt(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

/** Stable cover from channel id (no backend required). */
function coverFromId(id: string) {
  const palette: Array<[string, string]> = [
    ["#f97316", "#ef4444"],
    ["#0ea5e9", "#6366f1"],
    ["#22c55e", "#14b8a6"],
    ["#a855f7", "#3b82f6"],
    ["#f59e0b", "#f97316"],
    ["#10b981", "#0ea5e9"],
    ["#ef4444", "#f43f5e"],
    ["#6366f1", "#a855f7"],
  ];
  const idx = hashToInt(id) % palette.length;
  const [a, b] = palette[idx];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

function safeJsonParse(raw: string | null): any | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cookieGet(name: string): string | undefined {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[-.$?*|{}()[\]\\/+^]/g, "\\$&")}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

function deepFindUserLabel(obj: any, depth = 3): string | undefined {
  if (!obj || depth < 0) return undefined;

  const direct = userLabelFromAny(obj);
  if (direct) return direct;

  if (typeof obj !== "object") return undefined;

  const candidates = [obj.user, obj.profile, obj.account, obj.auth, obj.session, obj.me, obj.currentUser];

  for (const c of candidates) {
    const lbl = deepFindUserLabel(c, depth - 1);
    if (lbl) return lbl;
  }

  for (const k of Object.keys(obj)) {
    if (/(user|profile|account|auth|session|me|identity)/i.test(k)) {
      const lbl = deepFindUserLabel((obj as any)[k], depth - 1);
      if (lbl) return lbl;
    }
  }

  return undefined;
}

function readCurrentUserLabel(): string | undefined {
  const storages: Storage[] = [];

  if (typeof window !== "undefined") {
    try {
      storages.push(window.localStorage);
    } catch {}
    try {
      storages.push(window.sessionStorage);
    } catch {}
  }

  const userKeys = [
    "user",
    "currentUser",
    "authUser",
    "novasign:user",
    "profile",
    "me",
    "account",
    "auth",
    "authState",
    "session",
    "persist:root",
    "reduxPersist:root",
  ];

  for (const st of storages) {
    for (const k of userKeys) {
      try {
        const raw = st.getItem(k);
        if (!raw) continue;

        if (k === "persist:root" || k === "reduxPersist:root") {
          const root = safeJsonParse(raw);
          if (root && typeof root === "object") {
            const lblRoot = deepFindUserLabel(root);
            if (lblRoot) return lblRoot;

            for (const sliceKey of Object.keys(root)) {
              const sliceRaw = (root as any)[sliceKey];
              const sliceObj = typeof sliceRaw === "string" ? safeJsonParse(sliceRaw) : sliceRaw;
              const lblSlice = deepFindUserLabel(sliceObj);
              if (lblSlice) return lblSlice;
            }
          }
          continue;
        }

        const obj = safeJsonParse(raw);
        const lbl = deepFindUserLabel(obj) || userLabelFromAny(obj);
        if (lbl) return lbl;

        if (typeof raw === "string" && raw.includes("@")) return raw;
      } catch {}
    }
  }

  const tokenKeys = ["access_token", "accessToken", "token", "authToken", "id_token", "idToken", "jwt"];

  for (const st of storages) {
    for (const tk of tokenKeys) {
      try {
        const jwt = st.getItem(tk);
        if (!jwt) continue;
        const parts = jwt.split(".");
        if (parts.length < 2) continue;

        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const pad = "=".repeat((4 - (b64.length % 4)) % 4);
        const json = atob(b64 + pad);
        const payload = safeJsonParse(json);

        const label =
          (payload as any)?.name ||
          (payload as any)?.fullName ||
          (payload as any)?.preferred_username ||
          (payload as any)?.username ||
          (payload as any)?.email;

        if (label) return label;
      } catch {}
    }
  }

  const cookieKeys = ["user", "currentUser", "authUser", "profile", "me", "username", "email"];
  for (const ck of cookieKeys) {
    const v = cookieGet(ck);
    const obj = safeJsonParse(v ?? null);
    const lbl = deepFindUserLabel(obj) || userLabelFromAny(obj) || v;
    if (lbl) return lbl;
  }

  const w = window as any;
  const globals = [w.__INITIAL_STATE__, w.__PRELOADED_STATE__, w.__NOVASIGN_STATE__, w.__APP_STATE__];
  for (const g of globals) {
    const lbl = deepFindUserLabel(g);
    if (lbl) return lbl;
  }

  return undefined;
}

function userLabelFromAny(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;

  if (typeof v === "object") {
    return (
      (v as any).name ||
      (v as any).fullName ||
      (v as any).displayName ||
      (v as any).username ||
      (v as any).email ||
      (v as any).user?.name ||
      (v as any).user?.fullName ||
      (v as any).user?.displayName ||
      (v as any).user?.username ||
      (v as any).user?.email
    );
  }
  return undefined;
}

function getUpdatedByLabel(ch: any): string | undefined {
  if (!ch) return undefined;

  return (
    userLabelFromAny(ch.updatedBy) ||
    userLabelFromAny(ch.updated_by) ||
    userLabelFromAny(ch.updatedByUser) ||
    userLabelFromAny(ch.updated_by_user) ||
    userLabelFromAny(ch.lastUpdatedBy) ||
    userLabelFromAny(ch.last_updated_by) ||
    userLabelFromAny(ch.audit?.updatedBy) ||
    userLabelFromAny(ch.meta?.updatedBy) ||
    userLabelFromAny(ch.createdBy) ||
    userLabelFromAny(ch.created_by)
  );
}

function formatUpdated(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Outside click hook that accepts nullable refs. */
function useShowingOutsideClick<T extends HTMLElement>(ref: React.RefObject<T | null>, onOutside: () => void) {
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const el = ref.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (!el.contains(target)) onOutside();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [ref, onOutside]);
}

type DimensionPreset = { label: string; w: number; h: number };
const DIM_PRESETS: DimensionPreset[] = [
  { label: "UHD 4K (3840 × 2160)", w: 3840, h: 2160 },
  { label: "QHD (2560 × 1440)", w: 2560, h: 1440 },
  { label: "Full HD (1920 × 1080)", w: 1920, h: 1080 },
  { label: "720p HD (1280 × 720)", w: 1280, h: 720 },
  { label: "480 SD (640 × 480)", w: 640, h: 480 },
  { label: "iPad (1024 × 768)", w: 1024, h: 768 },
  { label: "iPhone X (812 × 375)", w: 812, h: 375 },
];

function defaultTransition(): ZoneTransition {
  return {
    enabled: false,
    type: "fade",
    durationSec: 0.5,
    color: "#000000",
    direction: "right",
    easing: "ease-in-out",
    zoomMode: "in",
    zoomStartScale: 0.9,
  };
}

/** Map backend layoutId -> UI layoutId */
function apiLayoutToUi(layoutId: string | undefined): string {
  if (!layoutId) return "layout_main";
  if (layoutId === "default") return "layout_main";
  if (layoutId.startsWith("layout_")) return layoutId;
  return "layout_main";
}

/** Map UI layoutId -> backend layoutId */
function uiLayoutToApi(layoutId: string): string {
  if (layoutId === "layout_main") return "default";
  return layoutId;
}

/** Map backend transition -> UI transition (stored on zone z1) */
function apiTransitionToUi(t?: ApiChannelTransition): ZoneTransition {
  const base = defaultTransition();
  if (!t) return base;

  const type = String(t.type ?? "").toLowerCase();
  const enabled = Boolean(t.enabled);

  if (!enabled) {
    return { ...base, enabled: false, type: "cut", durationSec: 0 };
  }

  if (type === "fade") {
    return { ...base, enabled: true, type: "fade", durationSec: Number(t.duration ?? 0.5), color: "#000000" };
  }

  return {
    ...base,
    enabled: true,
    type: "slide",
    durationSec: Number(t.duration ?? 0.5),
    direction: (t.direction as TransitionDirection) || "right",
    easing: "ease-in-out",
  };
}

/**
 * Map UI transition -> backend transition
 * - "cut" is effectively "no transition": enabled=false
 * - push/wipe/zoom are mapped to slide/fade to avoid backend validation failures
 */
function uiTransitionToApi(t: ZoneTransition): ApiChannelTransition {
  if (!t.enabled || t.type === "cut") {
    return { enabled: false, type: "slide", duration: 0.5, direction: "right" };
  }

  if (t.type === "fade") {
    return { enabled: true, type: "fade", duration: Number(t.durationSec || 0.5) };
  }

  if (t.type === "zoom") {
    return { enabled: true, type: "fade", duration: Number(t.durationSec || 0.5) };
  }

  return {
    enabled: true,
    type: "slide",
    duration: Number(t.durationSec || 0.5),
    direction: t.direction || "right",
  };
}

/* ===================== ScreenCloud-like helpers ===================== */

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatHMS(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  return `${pad2(mm)}:${pad2(ss)}`;
}
function parseHMS(v: string): number | null {
  const s = v.trim();
  if (!s) return null;

  // allow "12" or "00:12" or "0:00:12"
  if (/^\d+$/.test(s)) return Number(s);

  const parts = s.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;

  let h = 0, m = 0, sec = 0;
  if (parts.length === 3) [h, m, sec] = parts.map(Number);
  else if (parts.length === 2) [m, sec] = parts.map(Number);
  else return null;

  return h * 3600 + m * 60 + sec;
}


function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeTime(t: string) {
  // accept HH:mm or HH:mm:ss
  const parts = t.split(":").map((x) => x.trim());
  if (parts.length < 2) return "00:00:00";
  const hh = clampInt(Number(parts[0] || 0), 0, 23);
  const mm = clampInt(Number(parts[1] || 0), 0, 59);
  const ss = clampInt(Number(parts[2] || 0), 0, 59);
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

function defaultSchedule(): ZoneItemSchedule {
  return {
    id: crypto.randomUUID(),
    mode: "everyday",
    weeklyDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
    dateOnlyEnabled: false,
    dateStart: null,
    dateEnd: null,
    timeWindows: [],
    playInFullScreen: false,
    priority: false,
  };
}

function scheduleBadgeLabel(s: ZoneItemSchedule) {
  if (s.dateOnlyEnabled) return "DATE";

  const days = s.weeklyDays ?? [];
  const isEveryday = s.mode === "everyday" || days.length === 7;

  if (isEveryday) return "EVERYDAY";
  if (days.length <= 2) return days.join(" ");
  return `${days.length} DAYS`; // e.g. "5 DAYS"
}


function scheduleSubtitle(s: ZoneItemSchedule) {
  if (s.dateOnlyEnabled) {
    const range = `${s.dateStart ?? "—"} → ${s.dateEnd ?? "—"}`;
    const tw = s.timeWindows.length ? "Custom time" : "All day";
    return `${range} · ${tw}`;
  }
  const label = s.weeklyDays.length === 7 ? "All week" : s.weeklyDays.join(" ");
  return `${label} · All day`;
}


/** Return schedules array with guaranteed >= 1 */
function ensureSchedules(it: ZoneContentItem): ZoneItemSchedule[] {
  const fromArray = Array.isArray(it.schedules) ? it.schedules.filter(Boolean) : [];
  if (fromArray.length) return fromArray;

  if (it.schedule) return [it.schedule];

  return [defaultSchedule()];
}

/** ======================= Modals ======================= */

function ChannelSizeModal({
  open,
  current,
  value,
  presets,
  onChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  current: { w: number; h: number };
  value: { w: number; h: number };
  presets: Array<{ label: string; w: number; h: number }>;
  onChange: (v: { w: number; h: number }) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const selectedKey = `${value.w}x${value.h}`;
  const hasPreset = presets.some((p) => `${p.w}x${p.h}` === selectedKey);

  return (
    <div className="dim-backdrop" role="dialog" aria-modal="true">
      <div className="dim-modal">
        <div className="dim-header">
          <div className="dim-title">Channel Size</div>
          <button className="dim-close" onClick={onClose} aria-label="Close" type="button">
            ×
          </button>
        </div>

        <div className="dim-body">
          <div className="ce-field">
            <select
              value={hasPreset ? selectedKey : "__custom__"}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__custom__") return;
                const [wStr, hStr] = v.split("x");
                onChange({ w: Number(wStr), h: Number(hStr) });
              }}
            >
              {presets.map((p) => (
                <option key={`${p.w}x${p.h}`} value={`${p.w}x${p.h}`}>
                  {p.label}
                </option>
              ))}
              {!hasPreset && <option value="__custom__">{`Custom (${value.w} × ${value.h})`}</option>}
            </select>
          </div>

          <div className="ce-note">
            Please note, changing the Channel Size will affect content already playing on your screen(s). Are you sure
            you want to continue?
          </div>
        </div>

        <div className="dim-footer">
          <button className="btn btn-ghost" onClick={onClose} type="button">
            Not Now
          </button>
          <button className="btn btn-primary" onClick={onConfirm} type="button">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleModal({
  open,
  anchorRect,
  itemName,
  schedule,
  onClose,
  onChange,
  onDelete,
}: {
  open: boolean;
  anchorRect: DOMRect | null;
  itemName: string;
  schedule: ZoneItemSchedule;
  onClose: () => void;
  onChange: (next: ZoneItemSchedule) => void;
  onDelete?: () => void;
}) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  useShowingOutsideClick(modalRef, () => {
    if (open) onClose();
  });

  if (!open) return null;

  const pos = (() => {
    // place modal near anchor, but keep in viewport
    const w = 360;
    const h = 520;
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const ax = anchorRect ? anchorRect.left : vw / 2;
    const ay = anchorRect ? anchorRect.top : vh / 2;

    let left = ax;
    let top = ay + (anchorRect?.height ?? 0) + 8;

    if (left + w + margin > vw) left = vw - w - margin;
    if (left < margin) left = margin;

    if (top + h + margin > vh) top = (anchorRect ? anchorRect.top : vh / 2) - h - 8;
    if (top < margin) top = margin;

    return { left, top, width: w, height: h };
  })();

  const sch = schedule;

  const toggleDay = (d: Weekday) => {
    const set = new Set<Weekday>(sch.weeklyDays);
    if (set.has(d)) set.delete(d);
    else set.add(d);

    const next = Array.from(set).filter((x): x is Weekday =>
      ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].includes(x)
    );

    // keep at least one
    const safe: Weekday[] = next.length ? next : ["MON"];

    onChange({
      ...sch,
      weeklyDays: safe,
      mode: safe.length === 7 ? "everyday" : "weekly",
      dateOnlyEnabled: false, // enforce mutual exclusivity
    });
  };

  const setAllDays = () =>
    onChange({
      ...sch,
      weeklyDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
      mode: "everyday",
      dateOnlyEnabled: false,
    });

  const addTimeWindow = () => {
    const tw: ScheduleTimeWindow = {
      id: crypto.randomUUID(),
      startTime: "10:00:00",
      endTime: "13:00:00",
    };
    onChange({ ...sch, timeWindows: [...sch.timeWindows, tw] });
  };

  const removeTimeWindow = (id: string) => {
    onChange({ ...sch, timeWindows: sch.timeWindows.filter((x) => x.id !== id) });
  };

  const updateTimeWindow = (id: string, patch: Partial<ScheduleTimeWindow>) => {
    onChange({
      ...sch,
      timeWindows: sch.timeWindows.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    });
  };

  const enableDateOnly = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = pad2(today.getMonth() + 1);
    const dd = pad2(today.getDate());
    const d0 = `${yyyy}-${mm}-${dd}`;

    onChange({
      ...sch,
      dateOnlyEnabled: true,
      dateStart: sch.dateStart ?? d0,
      dateEnd: sch.dateEnd ?? d0,
    });
  };

  const disableDateOnly = () => {
    onChange({
      ...sch,
      dateOnlyEnabled: false,
    });
  };

  const weeklySelected = sch.mode === "weekly" && sch.weeklyDays.length < 7;

  return (
    <div className="sm-backdrop" aria-hidden={!open}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="sm-modal"
        style={{
          left: pos.left,
          top: pos.top,
          width: pos.width,
          height: pos.height,
        }}
      >
        {/* Header */}
        <div className="sm-header">
          <div className="sm-title" title={itemName}>
            {itemName}
          </div>

          {onDelete && (
            <button type="button" onClick={onDelete} title="Delete schedule" className="sm-icon-btn">
              🗑
            </button>
          )}

          <button onClick={onClose} type="button" aria-label="Close" className="sm-close">
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="sm-tabs">
          <button
            type="button"
            onClick={() => disableDateOnly()}
            className={`sm-tab ${!sch.dateOnlyEnabled ? "is-active" : ""}`}
          >
            Weekly
          </button>

          <button
            type="button"
            onClick={() => enableDateOnly()}
            className={`sm-tab ${sch.dateOnlyEnabled ? "is-active" : ""}`}
          >
            Specific date only
          </button>
        </div>

        <div className="sm-body">
          {/* Weekly */}
          {!sch.dateOnlyEnabled && (
            <div className="sm-weekly">
              <div className="sm-days">
                {(
                  [
                    ["MON", "Mon"],
                    ["TUE", "Tue"],
                    ["WED", "Wed"],
                    ["THU", "Thu"],
                    ["FRI", "Fri"],
                    ["SAT", "Sat"],
                    ["SUN", "Sun"],
                  ] as Array<[Weekday, string]>
                ).map(([d, lbl]) => {
                  const isEveryday = sch.weeklyDays.length === 7 && sch.mode === "everyday";
                  const active = sch.weeklyDays.includes(d) && (weeklySelected || isEveryday);

                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        if (isEveryday) {
                          onChange({
                            ...sch,
                            dateOnlyEnabled: false,
                            mode: "weekly",
                            weeklyDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
                          });
                        } else {
                          toggleDay(d);
                        }
                      }}
                      className={`sm-day ${active ? "is-active" : ""}`}
                      title={isEveryday ? "EVERYDAY (select a day to switch to Weekly)" : ""}
                    >
                      {lbl.toUpperCase()}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setAllDays()}
                  className={`sm-everyday ${sch.weeklyDays.length === 7 && sch.mode === "everyday" ? "is-active" : ""}`}
                >
                  EVERYDAY
                </button>
              </div>
            </div>
          )}

          {/* Date only */}
          {sch.dateOnlyEnabled && (
            <>
              <div className="sm-section-title">Date range</div>

              <div className="sm-date-row">
                <input
                  className="sm-input"
                  type="date"
                  value={sch.dateStart ?? ""}
                  onChange={(e) => onChange({ ...sch, dateStart: e.target.value || null })}
                />
                <div className="sm-sep">-</div>
                <input
                  className="sm-input"
                  type="date"
                  value={sch.dateEnd ?? ""}
                  onChange={(e) => onChange({ ...sch, dateEnd: e.target.value || null })}
                />
              </div>

              <button type="button" onClick={() => addTimeWindow()} className="sm-add-btn">
                + Add play time
              </button>

              <div className="sm-section-title">Play time</div>

              {sch.timeWindows.map((tw) => (
                <div key={tw.id} className="sm-time-row">
                  <input
                    className="sm-input"
                    type="time"
                    step={1}
                    value={tw.startTime}
                    onChange={(e) => updateTimeWindow(tw.id, { startTime: normalizeTime(e.target.value) })}
                  />
                  <div className="sm-sep">-</div>
                  <input
                    className="sm-input"
                    type="time"
                    step={1}
                    value={tw.endTime}
                    onChange={(e) => updateTimeWindow(tw.id, { endTime: normalizeTime(e.target.value) })}
                  />
                  <button
                    type="button"
                    onClick={() => removeTimeWindow(tw.id)}
                    title="Remove time window"
                    className="sm-x"
                  >
                    ×
                  </button>
                </div>
              ))}

              {sch.timeWindows.length === 0 && (
                <div className="sm-muted">No play time windows. Content will play all day for this date range.</div>
              )}
            </>
          )}

          {/* More options */}
          <div className="sm-section-title sm-mt">More Options</div>

          <div className="sm-option">
            <div className={`sm-option-ic ${sch.playInFullScreen ? "is-on" : ""}`}>⛶</div>

            <div className="sm-option-text">
              <div className="sm-option-title">Play in Full Screen</div>
              <div className="sm-option-desc">
                Play in Full Screen will make only this content visible and will hide the other zones when it is
                scheduled to play.
              </div>
            </div>

            <button
              type="button"
              onClick={() => onChange({ ...sch, playInFullScreen: !sch.playInFullScreen })}
              className={`sm-toggle ${sch.playInFullScreen ? "is-on" : ""}`}
              aria-label="Play in Full Screen"
            >
              <span className="sm-toggle-knob" />
            </button>
          </div>

          <div className="sm-option">
            <div className={`sm-option-ic sm-star ${sch.priority ? "is-on" : ""}`}>★</div>

            <div className="sm-option-text">
              <div className="sm-option-title">Set as Priority</div>
              <div className="sm-option-desc">
                This content will override any other content scheduled for the same time period.
              </div>
            </div>

            <button
              type="button"
              onClick={() => onChange({ ...sch, priority: !sch.priority })}
              className={`sm-toggle ${sch.priority ? "is-on" : ""}`}
              aria-label="Set as Priority"
            >
              <span className="sm-toggle-knob" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



function MediaPreviewModal({
  open,
  item,
  meta,
  onClose,
  onDelete,
  onDownload,
}: {
  open: boolean;
  item: ZoneContentItem | null;
  meta?: MediaMeta;
  onClose: () => void;
  onDelete: () => void;
  onDownload: (url: string, filename: string) => void;
}) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  useShowingOutsideClick(modalRef, () => {
    if (open) onClose();
  });

  if (!open || !item) return null;

  const isVideo = item.sourceType === "media" && item.mediaType === "video";
  const isImage = item.sourceType === "media" && item.mediaType === "image";

  const mime = meta?.mimeType ?? null;
  const size = formatBytes(meta?.sizeBytes ?? null);

  const dur =
    isVideo && typeof meta?.durationSec === "number" && meta.durationSec > 0
      ? formatHMS(meta.durationSec)
      : isVideo
      ? formatHMS(item.durationSec)
      : null;

  // Preview URL: prefer real url; for images fallback to thumbnail
  const previewUrl = meta?.url ?? (isImage ? meta?.thumbnailUrl ?? null : null) ?? null;

  // Download URL: prefer real url; fallback to thumbnail for images only
  const downloadUrl = meta?.url ?? (isImage ? meta?.thumbnailUrl ?? null : null) ?? null;

  return (
    <div className="mp-backdrop" role="dialog" aria-modal="true">
      <div ref={modalRef} className="mp-modal">
        {/* Header */}
        <div className="mp-header">
          <div className="mp-title" title={item.name}>
            {item.name}
          </div>

          <button onClick={onClose} type="button" aria-label="Close" className="mp-close">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="mp-body">
          <div className="mp-preview">
            {isVideo ? (
              previewUrl ? (
                <video className="mp-media-video" src={previewUrl} controls autoPlay preload="metadata" />
              ) : (
                <div className="mp-empty">No video URL available.</div>
              )
            ) : previewUrl ? (
              <img className="mp-media-image" src={previewUrl} alt="" />
            ) : (
              <div className="mp-empty">No preview available.</div>
            )}
          </div>

          <div className="mp-details">
            <div className="mp-details-title">DETAILS</div>

            <div className="mp-grid">
              <div className="mp-row">
                <div className="mp-label">Type</div>
                <div className="mp-value">{item.mediaType ?? item.sourceType}</div>
              </div>

              <div className="mp-row">
                <div className="mp-label">Format (MIME)</div>
                <div className="mp-value">{mime ?? "—"}</div>
              </div>

              <div className="mp-row">
                <div className="mp-label">File size</div>
                <div className="mp-value">{size}</div>
              </div>

              {isVideo && (
                <div className="mp-row">
                  <div className="mp-label">Duration</div>
                  <div className="mp-value">{dur ?? "—"}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer (3rd row) */}
        <div className="mp-footer">
          <button className="mp-btn mp-btn-danger" type="button" onClick={onDelete}>
            Delete
          </button>

          <button
            className="mp-btn mp-btn-secondary"
            type="button"
            onClick={() => {
              if (!downloadUrl) return;
              onDownload(downloadUrl, item.name || "file");
            }}
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}


/** ======================= Layout Preview ======================= */

function LayoutThumb({
  layout,
  width,
  height,
  activeZoneId,
  onHover,
  onZoneHoverId,
  onZoneSelectId,
  showBadges = true,
}: {
  layout: LayoutDef;
  width: number;
  height: number;
  activeZoneId?: string;
  onHover: (txt: string | null, x: number, y: number) => void;
  onZoneHoverId?: (id: string | null) => void;
  onZoneSelectId?: (id: string) => void;
  showBadges?: boolean;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  return (
    <div className="ce-layout-thumb">
      {layout.zones.map((z, idx) => {
        const isActive = activeZoneId === z.id;
        const isHover = hoverId === z.id;

        return (
          <div
            key={z.id}
            className={`ce-zone ${isActive ? "is-active" : ""} ${isHover ? "is-hover" : ""}`}
            style={{
              left: `${z.x}%`,
              top: `${z.y}%`,
              width: `${z.w}%`,
              height: `${z.h}%`,
            }}
            onMouseEnter={(e) => {
              setHoverId(z.id);
              onZoneHoverId?.(z.id);

              const pxW = Math.round((z.w / 100) * width);
              const pxH = Math.round((z.h / 100) * height);
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onHover(`w:${pxW}\nh:${pxH}`, rect.left + rect.width / 2, rect.top);
            }}
            onMouseLeave={() => {
              setHoverId(null);
              onZoneHoverId?.(null);
              onHover(null, 0, 0);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onZoneSelectId?.(z.id);
            }}
          >
            {showBadges && <div className="ce-zone-badge">{idx + 1}</div>}
          </div>
        );
      })}
    </div>
  );
}

function ChooseLayoutModal({
  open,
  layouts,
  currentLayoutId,
  width,
  height,
  onClose,
  onSelect,
  onCustomize,
}: {
  open: boolean;
  layouts: LayoutDef[];
  currentLayoutId: string;
  width: number;
  height: number;
  onClose: () => void;
  onSelect: (layoutId: string) => void;
  onCustomize: () => void;
}) {
  const [tab, setTab] = useState<"all" | "custom">("all");
  const [picked, setPicked] = useState(currentLayoutId);
  const [hover, setHover] = useState<{ txt: string | null; x: number; y: number }>({ txt: null, x: 0, y: 0 });

  useEffect(() => {
    if (open) setPicked(currentLayoutId);
  }, [open, currentLayoutId]);

  if (!open) return null;

  const shown = tab === "all" ? layouts : [];

  return (
    <div className="clm-backdrop" role="dialog" aria-modal="true">
      <div className="clm-modal">
        <div className="clm-header">
          <div className="clm-title-row">
            <div className="clm-title">Choose Layout</div>
            <button className="clm-close" onClick={onClose} aria-label="Close" type="button">
              ×
            </button>
          </div>

          <div className="clm-tabs">
            <button
              className={`clm-tab ${tab === "all" ? "is-active" : ""}`}
              onClick={() => setTab("all")}
              type="button"
            >
              ALL LAYOUTS
            </button>
            <button
              className={`clm-tab ${tab === "custom" ? "is-active" : ""}`}
              onClick={() => setTab("custom")}
              type="button"
            >
              CUSTOM LAYOUTS
            </button>
          </div>
        </div>

        <div className="clm-body">
          <div className="clm-grid">
            {shown.map((l) => (
              <button
                key={l.id}
                className={`layout-preview ${picked === l.id ? "is-selected" : ""}`}
                onClick={() => setPicked(l.id)}
                type="button"
              >
                <LayoutThumb
                  layout={l}
                  width={width}
                  height={height}
                  onHover={(txt, x, y) => setHover({ txt, x, y })}
                  showBadges={false}
                />
                <div className="layout-name">{l.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="clm-footer">
          <button className="btn btn-ghost" onClick={onCustomize} type="button">
            Customize
          </button>
          <button className="btn btn-primary" onClick={() => onSelect(picked)} type="button">
            Select
          </button>
        </div>

        {hover.txt && (
          <div className="ce-hover-tip" style={{ left: hover.x, top: hover.y }}>
            {hover.txt.split("\n").map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ======================= ChannelEditorPage ======================= */

type MediaMeta = {
  thumbnailUrl?: string | null;   // for images: use url
  durationSec?: number | null;    // for video
  mediaType?: "image" | "video";
  name?: string;
  url?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};


export default function ChannelEditorPage() {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contentPickerOpen, setContentPickerOpen] = useState(false);
  const [channel, setChannel] = useState<Channel | null>(null);

  const [layoutId, setLayoutId] = useState<string>("layout_main");
  const [width, setWidth] = useState<number>(1920);
  const [height, setHeight] = useState<number>(1080);

  const [activeZoneId, setActiveZoneId] = useState<string>("z1");
  const [hoverZoneId, setHoverZoneId] = useState<string | null>(null);

  const [panelTab, setPanelTab] = useState<"layout" | "settings">("layout");
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);

  // top-right more menu
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  useShowingOutsideClick(moreRef, () => setMoreOpen(false));

  const [hover, setHover] = useState<{ txt: string | null; x: number; y: number }>({ txt: null, x: 0, y: 0 });

  // Channel size modal
  const [channelSizeOpen, setChannelSizeOpen] = useState(false);
  const [pendingDim, setPendingDim] = useState<{ w: number; h: number }>({ w: 1920, h: 1080 });

  // transitions per zone (UI)
  const [zoneTransitions, setZoneTransitions] = useState<Record<string, ZoneTransition>>({
    z1: defaultTransition(),
    background_audio: defaultTransition(),
  });

  // Save status / notifications
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [hasChanges, setHasChanges] = useState(false);
const [isSaving, setIsSaving] = useState(false);
const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const saveStatusTimerRef = useRef<number | null>(null);
  const lastSavedSnapshotRef = useRef<string>("");

  /* -------------------- ZONE CONTENT (state) -------------------- */

  const [zoneContents, setZoneContents] = useState<Record<string, ZoneContentItem[]>>({});
  const zoneContentsPrevRef = useRef<string>(""); // to detect changes
  const zonePatchTimersRef = useRef<Record<string, number>>({}); // debounce per zone

  // media meta cache (for thumbnails + video duration)
  const [mediaMeta, setMediaMeta] = useState<Record<string, MediaMeta>>({});

  type PlaylistMeta = { totalDurationSec?: number | null; itemCount?: number | null; name?: string };

const [playlistMeta, setPlaylistMeta] = useState<Record<string, PlaylistMeta>>({});
const playlistMetaReqInFlight = useRef<Set<string>>(new Set());

async function resolvePlaylistMeta(playlistId: string) {
  if (!playlistId) return;
  if (playlistMeta[playlistId]) return;
  if (playlistMetaReqInFlight.current.has(playlistId)) return;

  playlistMetaReqInFlight.current.add(playlistId);
  try {
    const endpoints = [
      `/api/playlists/${playlistId}`,
      `/api/playlists/${playlistId}/items`,
      `/api/library/playlists/${playlistId}`,
      `/api/playlists?id=${encodeURIComponent(playlistId)}`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, { method: "GET" });
        if (!res.ok) continue;
        const data = await res.json().catch(() => null);
        if (!data) continue;

        const root = data.item ?? data;

        // If backend already provides total duration
        const directTotal =
          typeof root.totalDurationSec === "number"
            ? root.totalDurationSec
            : typeof root.totalDuration === "number"
            ? root.totalDuration
            : null;

        // Try to extract items array and sum durations
        const items: any[] =
          (Array.isArray(root.items) ? root.items : null) ??
          (Array.isArray(root.playlistItems) ? root.playlistItems : null) ??
          (Array.isArray(root.data) ? root.data : null) ??
          (Array.isArray(data.items) ? data.items : null) ??
          (Array.isArray(data.data) ? data.data : null) ??
          [];

        let sum = 0;
        let hasAny = false;
        for (const it of items) {
          const d =
            typeof it.durationSec === "number"
              ? it.durationSec
              : typeof it.duration === "number"
              ? it.duration
              : typeof it.durationMs === "number"
              ? Math.round(it.durationMs / 1000)
              : null;

          if (typeof d === "number" && d > 0) {
            sum += d;
            hasAny = true;
          }
        }

        const total = typeof directTotal === "number" && directTotal > 0 ? directTotal : hasAny ? sum : null;

        setPlaylistMeta((prev) => ({
          ...prev,
          [playlistId]: {
            totalDurationSec: total,
            itemCount: items.length || null,
            name: root.name ?? root.title ?? undefined,
          },
        }));
        return;
      } catch {
        // try next endpoint
      }
    }
  } finally {
    playlistMetaReqInFlight.current.delete(playlistId);
  }
}


  const mediaMetaReqInFlight = useRef<Set<string>>(new Set());

  // Schedule modal state (now edits a specific schedule row)
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleForItemId, setScheduleForItemId] = useState<string | null>(null);
  const [scheduleForScheduleId, setScheduleForScheduleId] = useState<string | null>(null);
  const [scheduleAnchorRect, setScheduleAnchorRect] = useState<DOMRect | null>(null);

const mediaIndexRef = useRef<Record<string, any> | null>(null);
const mediaIndexInFlightRef = useRef<Promise<void> | null>(null);

const [previewOpen, setPreviewOpen] = useState(false);
const [previewItem, setPreviewItem] = useState<ZoneContentItem | null>(null);

function openPreview(it: ZoneContentItem) {
  setPreviewItem(it);
  setPreviewOpen(true);

  // ensure meta exists (especially for video url)
  if (it.sourceType === "media") void resolveMediaMeta(it.sourceId);
}

function closePreview() {
  setPreviewOpen(false);
  setPreviewItem(null);
}

function downloadUrlToFile(url: string, filename: string) {
  // works with cookies/session (same-origin). Adjust if you use Authorization headers.
  fetch(url, { credentials: "include" })
    .then((r) => {
      if (!r.ok) throw new Error("Download failed");
      return r.blob();
    })
    .then((blob) => {
      const a = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = filename || "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    })
    .catch(console.error);
}

async function ensureMediaIndex() {
  if (mediaIndexRef.current) return;
  if (mediaIndexInFlightRef.current) return mediaIndexInFlightRef.current;

  mediaIndexInFlightRef.current = (async () => {
    // Try the endpoint you already have in Network: /api/media?folderId=root
    const res = await fetch(`/api/media?folderId=root`, { method: "GET" });
    if (!res.ok) throw new Error(`media list failed: ${res.status}`);
    const data = await res.json().catch(() => null);

    // Accept a few shapes: {items:[]}, {data:[]}, []...
    const items: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.data)
      ? data.data
      : [];

    const idx: Record<string, any> = {};
    for (const it of items) {
      const id = it.id ?? it._id;
      if (!id) continue;
      idx[String(id)] = it;
    }
    mediaIndexRef.current = idx;
  })().finally(() => {
    mediaIndexInFlightRef.current = null;
  });

  return mediaIndexInFlightRef.current;
}

  // Debug (kept as console only)
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("Zone contents:", zoneContents);
  }, [zoneContents]);

 async function resolveMediaMeta(sourceId: string) {
  if (!sourceId) return;
  if (mediaMeta[sourceId]) return;
  if (mediaMetaReqInFlight.current.has(sourceId)) return;

  mediaMetaReqInFlight.current.add(sourceId);
  try {
    // 1) Use the real backend list endpoint
    try {
      await ensureMediaIndex();
      const row = mediaIndexRef.current?.[sourceId];
      if (row) {
        const url =
  row.url ?? row.fileUrl ?? row.downloadUrl ?? row.previewUrl ?? null;

const type =
  row.type === "video" || row.mediaType === "video"
    ? "video"
    : row.type === "image" || row.mediaType === "image"
    ? "image"
    : undefined;

const thumb =
  row.thumbnailUrl ??
  row.thumbUrl ??
  row.thumbnail ??
  row.previewUrl ??
  row.posterUrl ??
  // ✅ IMPORTANT: fallback for images
  (type === "image" ? url : null) ??
  null;


        const dur =
          typeof row.durationSec === "number"
            ? row.durationSec
            : typeof row.duration === "number"
            ? row.duration
            : typeof row.durationMs === "number"
            ? Math.round(row.durationMs / 1000)
            : null;

        setMediaMeta((prev) => ({
          ...prev,
          [sourceId]: {
            thumbnailUrl: thumb,
            durationSec: dur,
            mediaType: type,
            name: row.name ?? row.title ?? undefined,
            url,
            mimeType: row.mimeType ?? row.mime ?? null,
            sizeBytes: typeof row.sizeBytes === "number" ? row.sizeBytes : null,
          },
        }));
        return;
      }
    } catch {
      // ignore
    }

    // 2) Old probes as fallback (optional)
    const endpoints = [
      `/api/media/${sourceId}`,
      `/api/library/media/${sourceId}`,
      `/api/assets/${sourceId}`,
      `/api/mediafile/${sourceId}`,
      `/api/mediafile?id=${encodeURIComponent(sourceId)}`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, { method: "GET" });
        if (!res.ok) continue;
        const parsed = await res.json().catch(() => null);
        if (!parsed) continue;

        const item = parsed.item ?? parsed;

const mediaUrl =
  item.url ?? item.fileUrl ?? item.downloadUrl ?? item.previewUrl ?? null;

const type =
  item.type === "video" || item.mediaType === "video"
    ? "video"
    : item.type === "image" || item.mediaType === "image"
    ? "image"
    : undefined;

const thumb =
  item.thumbnailUrl ??
  item.thumbUrl ??
  item.thumbnail ??
  item.previewUrl ??
  item.posterUrl ??
  // ✅ fallback for images
  (type === "image" ? mediaUrl : null) ??
  null;



        const dur =
          typeof item.durationSec === "number"
            ? item.durationSec
            : typeof item.duration === "number"
            ? item.duration
            : typeof item.durationMs === "number"
            ? Math.round(item.durationMs / 1000)
            : null;

        setMediaMeta((prev) => ({
          ...prev,
          [sourceId]: {
            thumbnailUrl: thumb,
            durationSec: dur,
            mediaType: type,
            name: item.name ?? item.title ?? undefined,
            url: mediaUrl,
          },
        }));
        return;
      } catch {
        // continue
      }
    }
  } finally {
    mediaMetaReqInFlight.current.delete(sourceId);
  }
}
function schedulesStorageKey(channelId: string) {
  return `novasign:channel:${channelId}:schedules:v1`;
}
function loadScheduleOverrides(channelId: string): Record<string, any> {
  try {
    const raw = localStorage.getItem(schedulesStorageKey(channelId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveScheduleOverrides(channelId: string, obj: Record<string, any>) {
  try {
    localStorage.setItem(schedulesStorageKey(channelId), JSON.stringify(obj));
  } catch {
    // ignore
  }
}

  function getItemSchedules(it: ZoneContentItem): ZoneItemSchedule[] {
    return ensureSchedules(it);
  }

  function setItemSchedules(zoneId: string, itemId: string, schedules: ZoneItemSchedule[]) {
    setZoneContents((prev) => {
      const list = prev[zoneId] ?? [];
      const next = list.map((x) =>
        x.id === itemId
          ? {
              ...x,
              schedules,
              // keep legacy schedule aligned with first row for backend compatibility
              schedule: schedules[0],
            }
          : x
      );
      return { ...prev, [zoneId]: next };
    });
    clearNoop(setSaveStatus);
  }

  function addScheduleRow(zoneId: string, itemId: string) {
    const newSch = defaultSchedule();
    setZoneContents((prev) => {
      const list = prev[zoneId] ?? [];
      const next = list.map((x) => {
        if (x.id !== itemId) return x;
        const current = ensureSchedules(x);
        const schedules = [...current, newSch];
        return { ...x, schedules, schedule: schedules[0] };
      });
      return { ...prev, [zoneId]: next };
    });
    setHasChanges(true);
    setSaveMsg(null);
    clearNoop(setSaveStatus);
  }

  function deleteScheduleRow(zoneId: string, itemId: string, scheduleId: string) {
    setZoneContents((prev) => {
      const list = prev[zoneId] ?? [];
      const next = list.map((x) => {
        if (x.id !== itemId) return x;
        const current = ensureSchedules(x);
        const schedules = current.filter((s) => s.id !== scheduleId);
        const safe = schedules.length ? schedules : [defaultSchedule()];
        return { ...x, schedules: safe, schedule: safe[0] };
      });
      return { ...prev, [zoneId]: next };
    });
    clearNoop(setSaveStatus);
  }

  // Open schedule modal for a specific schedule row
  function openScheduleModal(itemId: string, scheduleId: string, anchorEl: HTMLElement | null) {
    setScheduleForItemId(itemId);
    setScheduleForScheduleId(scheduleId);
    setScheduleAnchorRect(anchorEl ? anchorEl.getBoundingClientRect() : null);
    setScheduleOpen(true);
    setHasChanges(true);
setSaveMsg(null);

  }

  function closeScheduleModal() {
    setScheduleOpen(false);
    setScheduleForItemId(null);
    setScheduleForScheduleId(null);
    setScheduleAnchorRect(null);
  }

  async function patchZoneContent(zoneId: string, items: ZoneContentItem[]) {
    if (!id) return;

    // what backend expects for each zone item (no client id)
    // We attempt to send schedule/schedules + thumbnailUrl; if backend rejects, we strip and retry.
    const toApiFull = (it: ZoneContentItem) => {
      const { id: _clientId, ...rest } = it;

      const schedules = Array.isArray(rest.schedules) ? rest.schedules : rest.schedule ? [rest.schedule] : undefined;

      // keep BOTH for maximum compatibility (backend may accept either)
      const apiObj: any = {
        ...rest,
        schedule: schedules?.[0] ?? rest.schedule,
        schedules: schedules,
      };

      return apiObj;
    };

    const toApiStripped = (it: ZoneContentItem) => {
      const { id: _clientId, thumbnailUrl: _t, schedule: _s, schedules: _ss, ...rest } = it;
      return rest;
    };

    const apiItemsFull = items.map(toApiFull);
    const apiItemsStripped = items.map(toApiStripped);

    // 1) Try dedicated endpoint (if backend ever adds it)
    const zoneUrl = `${API_BASE}/${id}/zones/${zoneId}/content`;

    const tryPatch = async (url: string, bodyObj: any) => {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj),
      });
      return res;
    };

    try {
      let res = await tryPatch(zoneUrl, { items: apiItemsFull });
      if (res.ok) return;

      if (res.status === 400) {
        // likely schema rejects extra keys; retry stripped
        res = await tryPatch(zoneUrl, { items: apiItemsStripped });
        if (res.ok) return;
      }

      // If it's not 404, keep the error (real failure)
      if (res.status !== 404) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Zone content PATCH failed: ${res.status} ${res.statusText} ${txt}`.trim());
      }
    } catch {
      // fall through
    }

    // 2) Fallback: patch the channel itself with zones
    const channelUrl = `${API_BASE}/${id}`;

    // Merge with current zones in state (if any)
    const currentZones = (channel as any)?.zones ?? {};
    const nextZonesFull = { ...currentZones, [zoneId]: apiItemsFull };

    let res2 = await fetch(channelUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zones: nextZonesFull }),
    });

    if (!res2.ok && res2.status === 400) {
      // retry stripped
      const nextZonesStripped = { ...currentZones, [zoneId]: apiItemsStripped };
      res2 = await fetch(channelUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zones: nextZonesStripped }),
      });

      if (res2.ok) {
        setChannel((prev: any) => (prev ? { ...prev, zones: nextZonesStripped } : prev));
        return;
      }
    }

    if (!res2.ok) {
      const txt = await res2.text().catch(() => "");
      throw new Error(`Channel PATCH (zones) failed: ${res2.status} ${res2.statusText} ${txt}`.trim());
    }

    // Keep local channel state in sync
    setChannel((prev: any) => (prev ? { ...prev, zones: nextZonesFull } : prev));
  }

  function scheduleZonePatch(zoneId: string, items: ZoneContentItem[]) {
    // debounce per zone (prevents rapid PATCH spam)
    const timers = zonePatchTimersRef.current;
    if (timers[zoneId]) window.clearTimeout(timers[zoneId]);

    timers[zoneId] = window.setTimeout(() => {
      void patchZoneContent(zoneId, items);
    }, 350);
  }

  useEffect(() => {
    if (!id) return;

    const snap = JSON.stringify(zoneContents);
    if (snap === zoneContentsPrevRef.current) return;
    zoneContentsPrevRef.current = snap;

    for (const [zoneId, items] of Object.entries(zoneContents)) {
      scheduleZonePatch(zoneId, items);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneContents, id]);

  /* -------------------- EXISTING LOGIC BELOW -------------------- */

  const layout = useMemo<LayoutDef>(() => ALL_LAYOUTS.find((l: LayoutDef) => l.id === layoutId) ?? ALL_LAYOUTS[0], [layoutId]);

  const zones = useMemo(() => {
    const base = layout.zones.map((z) => ({ ...z }));
    return [...base, { id: "background_audio", name: "Background Audio", x: 0, y: 0, w: 0, h: 0 }];
  }, [layout.zones]);

  const activeZone = useMemo(() => zones.find((z) => z.id === activeZoneId) ?? zones[0], [zones, activeZoneId]);

  useEffect(() => {
    const zoneIds = new Set(zones.map((z) => z.id));
    if (!zoneIds.has(activeZoneId)) setActiveZoneId(zones[0].id);

    setZoneTransitions((prev) => {
      const next = { ...prev };
      for (const z of zones) {
        if (!next[z.id]) next[z.id] = defaultTransition();
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutId]);

  const snapshot = useMemo(() => {
    return JSON.stringify({
      layoutId,
      width,
      height,
      zoneTransitions,
      zoneContents,
    });
  }, [layoutId, width, height, zoneTransitions, zoneContents]);

  const isDirty = useMemo(() => snapshot !== lastSavedSnapshotRef.current, [snapshot]);

  useEffect(() => {
    if (saveStatus === "saved" || saveStatus === "noop" || saveStatus === "error") {
      if (saveStatusTimerRef.current) window.clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = window.setTimeout(() => setSaveStatus("idle"), 2500);
      
    }
    return () => {
      if (saveStatusTimerRef.current) window.clearTimeout(saveStatusTimerRef.current);
    };
  }, [saveStatus]);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const r = await fetchJsonStrict<{ item: Channel }>(`${API_BASE}/${id}`, { method: "GET" });
      const ch = r.item;
      // hydrate zoneContents from backend zones (so reload shows assignments)
let hydrated: Record<string, ZoneContentItem[]> = {};

if (ch.zones && typeof ch.zones === "object") {
  for (const [zoneId, list] of Object.entries(ch.zones as any)) {
    hydrated[zoneId] = (Array.isArray(list) ? list : []).map((it: any, idx: number) => {
      const schedulesFromApi: ZoneItemSchedule[] = Array.isArray(it.schedules)
        ? it.schedules.map((s: any) => ({
            ...s,
            id: s?.id ?? crypto.randomUUID(),
            weeklyDays: Array.isArray(s?.weeklyDays) ? s.weeklyDays : ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
            timeWindows: Array.isArray(s?.timeWindows) ? s.timeWindows : [],
          }))
        : it.schedule
        ? [
            {
              ...it.schedule,
              id: it.schedule?.id ?? crypto.randomUUID(),
              weeklyDays: Array.isArray(it.schedule?.weeklyDays)
                ? it.schedule.weeklyDays
                : ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
              timeWindows: Array.isArray(it.schedule?.timeWindows) ? it.schedule.timeWindows : [],
            },
          ]
        : [defaultSchedule()];

      return {
        id: crypto.randomUUID(),
        sourceType: it.sourceType,
        sourceId: it.sourceId,
        name: it.name ?? "(untitled)",
        mediaType: it.mediaType,
        durationSec: typeof it.durationSec === "number" ? it.durationSec : 10,
        order: typeof it.order === "number" ? it.order : idx,
        startAt: it.startAt ?? null,
        endAt: it.endAt ?? null,
        thumbnailUrl: it.thumbnailUrl ?? null,
        schedules: schedulesFromApi,
        schedule: schedulesFromApi[0],
      } as ZoneContentItem;
    });
  }

  // ✅ your overrides block can stay here (it uses hydrated)
  if (id) {
    const overrides = loadScheduleOverrides(id);
    for (const [zoneId, list] of Object.entries(hydrated)) {
      hydrated[zoneId] = (list as any[]).map((it) => {
        const key = `${zoneId}:${it.sourceType}:${it.sourceId}`;
        const ov = overrides[key];
        if (!ov) return it;

        const schedules = Array.isArray(ov.schedules) ? ov.schedules : null;
        return schedules ? { ...it, schedules, schedule: schedules[0] } : it;
      });
    }
  }

  setZoneContents({ ...hydrated });

  // resolve media metadata
  for (const items of Object.values(hydrated)) {
    for (const it of items) {
      if (it.sourceType === "media") void resolveMediaMeta(it.sourceId);
    }
  }
}


      const fallbackBy = readCurrentUserLabel();
      setChannel({
        ...ch,
        updatedBy: getUpdatedByLabel(ch) || fallbackBy || (ch as any).updatedBy,
      } as any);

      const uiLayoutId = apiLayoutToUi(ch.layoutId);
      const initialLayout = ALL_LAYOUTS.find((l) => l.id === uiLayoutId) ?? ALL_LAYOUTS[0];

      const initialWidth = ch.width || 1920;
      const initialHeight = ch.height || 1080;

      setLayoutId(uiLayoutId);
      setWidth(initialWidth);
      setHeight(initialHeight);

      const nextTransitions: Record<string, ZoneTransition> = {
        z1: apiTransitionToUi(ch.transition),
        background_audio: defaultTransition(),
      };

      for (const z of [...initialLayout.zones.map((z) => z.id), "background_audio"]) {
        if (!nextTransitions[z]) nextTransitions[z] = defaultTransition();
      }
      setZoneTransitions(nextTransitions);

      setActiveZoneId(initialLayout.zones[0]?.id ?? "z1");

      lastSavedSnapshotRef.current = JSON.stringify({
        layoutId: uiLayoutId,
        width: initialWidth,
        height: initialHeight,
        zoneTransitions: nextTransitions,
        zoneContents: hydrated,
      });
    } catch (e: any) {
      setError(`Failed to load channel. ${humanizeError(e)}`.trim());
    } finally {
      setLoading(false);
    }
  }
useEffect(() => {
  if (!id) return;

  const overrides: Record<string, any> = {};
  for (const [zoneId, items] of Object.entries(zoneContents)) {
    for (const it of items) {
      const key = `${zoneId}:${it.sourceType}:${it.sourceId}`;
      const schedules = ensureSchedules(it);
      overrides[key] = { schedules };
    }
  }
  saveScheduleOverrides(id, overrides);
}, [zoneContents, id]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cover = useMemo(() => {
    const channelId = id || "seed";
    const seed = getChannelCoverSeed(channelId);
    return coverFromSeed(seed);
  }, [id]);

  const dimLabel = useMemo(() => `${width} × ${height}`, [width, height]);

  const activeTransition = zoneTransitions[activeZoneId] ?? defaultTransition();

  function updateActiveTransition(patch: Partial<ZoneTransition>) {
    setZoneTransitions((prev) => ({
      ...prev,
      [activeZoneId]: { ...(prev[activeZoneId] ?? defaultTransition()), ...patch },
    }));
  }

  async function onSave() {
    if (!id) return;
    const snapshot = JSON.stringify({
      layoutId,
      width,
      height,
      zoneTransitions,
      zoneContents,
    });

    if (!isDirty) {
      setSaveStatus("noop");
      return;
    }

    setSaveStatus("saving");
    setError(null);

    const apiPayload = {
      layoutId: uiLayoutToApi(layoutId),
      transition: uiTransitionToApi(zoneTransitions.z1 ?? defaultTransition()),
      width,
      height,
    };

    const url = `${API_BASE}/${id}`;

    try {
      try {
        const res = await fetchJsonStrict<{ item: Channel }>(url, {
          method: "PATCH",
          body: JSON.stringify(apiPayload),
        });

        const fallbackBy = readCurrentUserLabel();
        setChannel({
          ...res.item,
          updatedBy: getUpdatedByLabel(res.item) || fallbackBy || res.item.updatedBy,
        } as any);
      } catch (e: any) {
        if (e?.status === 404 || e?.status === 405 || String(e?.message ?? "").toLowerCase().includes("patch")) {
          const res2 = await fetchJsonStrict<{ item: Channel }>(url, {
            method: "PUT",
            body: JSON.stringify(apiPayload),
          });
          setChannel(res2.item);
        } else {
          throw e;
        }
      }

      // ✅ Update baseline AND clear dirty
    lastSavedSnapshotRef.current = snapshot;
      setSaveStatus("saved");
    } catch (e: any) {
      setSaveStatus("error");
      setError(`Failed to save. ${humanizeError(e)}`.trim());
    }
  }

  const saveStatusText =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "saved"
      ? "Saved"
      : saveStatus === "noop"
      ? "No changes to save"
      : saveStatus === "error"
      ? "Save failed"
      : "";

  const orientationLabel = channel?.orientation ? (channel.orientation === "landscape" ? "Landscape" : "Portrait") : "—";

  const activeZoneItems = useMemo(() => {
    const items = zoneContents[activeZoneId] ?? [];
    return items.slice().sort((a, b) => a.order - b.order);
  }, [zoneContents, activeZoneId]);

  const hasAnyContent = Object.values(zoneContents).some((arr) => (arr?.length ?? 0) > 0);

  const byLabel = useMemo(() => {
    return getUpdatedByLabel(channel) || readCurrentUserLabel() || undefined;
  }, [channel]);

  const updatedLabel = channel?.updatedAt
    ? ` · Updated ${formatUpdated(channel.updatedAt)}${byLabel ? ` · By ${byLabel}` : ""}`
    : "";

  // keep media meta synchronized: whenever active zone items change, resolve missing media meta
  useEffect(() => {
    for (const it of activeZoneItems) {
      if (it.sourceType === "media") void resolveMediaMeta(it.sourceId);
      if (it.sourceType === "playlist") void resolvePlaylistMeta(it.sourceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeZoneItems]);

  function getItemThumb(it: ZoneContentItem) {
    if (it.thumbnailUrl) return it.thumbnailUrl;
    if (it.sourceType === "media") return mediaMeta[it.sourceId]?.thumbnailUrl ?? null;
    return null;
  }

  function getEffectiveDuration(it: ZoneContentItem) {
    if (it.sourceType === "media" && it.mediaType === "video") {
      const fromMeta = mediaMeta[it.sourceId]?.durationSec;
      if (typeof fromMeta === "number" && fromMeta > 0) return fromMeta;
      return it.durationSec;
    }
    return it.durationSec;
  }

  function updateItemInZone(zoneId: string, itemId: string, patch: Partial<ZoneContentItem>) {
    setZoneContents((prev) => {
      const list = prev[zoneId] ?? [];
      const next = list.map((x) => (x.id === itemId ? { ...x, ...patch } : x));
      return { ...prev, [zoneId]: next };
    });
    clearNoop(setSaveStatus);
  setHasChanges(true);
  setSaveMsg(null);

  }

  function deleteItemFromZone(zoneId: string, itemId: string) {
    setZoneContents((prev) => {
      const list = (prev[zoneId] ?? []).filter((x) => x.id !== itemId);
      // re-order
      const normalized = list.map((x, idx) => ({ ...x, order: idx }));
      return { ...prev, [zoneId]: normalized };
    });
  }

  // Helpers for editing a specific schedule row
  function getScheduleRow(it: ZoneContentItem, scheduleId: string): ZoneItemSchedule {
    const list = ensureSchedules(it);
    return list.find((s) => s.id === scheduleId) ?? list[0];
  }

  function updateScheduleRow(zoneId: string, itemId: string, scheduleId: string, nextSchedule: ZoneItemSchedule) {
    const items = zoneContents[zoneId] ?? [];
    const item = items.find((x) => x.id === itemId);
    if (!item) return;

    const schedules = ensureSchedules(item).map((s) => (s.id === scheduleId ? nextSchedule : s));
    setItemSchedules(zoneId, itemId, schedules);
  }

  // Schedule modal derived refs
  const scheduleModalItem = useMemo(() => {
    if (!scheduleForItemId) return null;
    return activeZoneItems.find((x) => x.id === scheduleForItemId) ?? null;
  }, [activeZoneItems, scheduleForItemId]);

  const scheduleModalSchedule = useMemo(() => {
    if (!scheduleModalItem || !scheduleForScheduleId) return null;
    return getScheduleRow(scheduleModalItem, scheduleForScheduleId);
  }, [scheduleModalItem, scheduleForScheduleId]);

  return (
    <div className="ce ce-compact">
      <div className="ce-topbar">
        <button className="ce-back" onClick={() => nav("/channels")} aria-label="Back" type="button">
          ←
        </button>

        <div className="ce-title">
          <div className="ce-cover" style={{ background: cover }} />
          <div className="ce-title-text">
            <div className="ce-name">{channel?.name ?? (loading ? "Loading…" : "Channel")}</div>
            <div className="ce-sub">
              {orientationLabel}
              {updatedLabel}
            </div>
          </div>
        </div>

        <div className="ce-actions">
          {saveStatusText && (
            <div className={`ce-save-status ce-save-status--${saveStatus}`} aria-live="polite">
              {saveStatusText}
            </div>
          )}

          <button className="btn btn-ghost" onClick={onSave} disabled={saveStatus === "saving"} type="button">
            Save
          </button>

          <button className="btn btn-ghost" onClick={() => {}} type="button">
            Preview
          </button>

          <button className="btn btn-primary" onClick={() => {}} type="button">
            Publish
          </button>

          <div className="ce-more" ref={moreRef}>
            <button className="btn btn-ghost" aria-label="More" onClick={() => setMoreOpen((v) => !v)} type="button">
              …
            </button>

            {moreOpen && (
              <div className="ce-menu">
                <button className="ce-menu-item" onClick={() => setMoreOpen(false)} type="button">
                  Duplicate
                </button>
                <button className="ce-menu-item danger" onClick={() => setMoreOpen(false)} type="button">
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <div className="ce-alert">{error}</div>}

      <div className="ce-grid">
        <div className="ce-main">
          <div className="ce-main-toolbar">
            <div className="ce-selects">
              <div className="ce-select">
                <select value={activeZoneId} onChange={(e) => setActiveZoneId(e.target.value)}>
                  {layout.zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                  <option value="background_audio">Background Audio</option>
                </select>
              </div>

              <div className="ce-select">
                <select value={"fill"} onChange={() => {}}>
                  <option value="fill">Fill Zone</option>
                </select>
              </div>
            </div>

            <button className="btn btn-ghost" onClick={() => setContentPickerOpen(true)} type="button">
              + Add Content
            </button>
          </div>

          {!hasAnyContent ? (
            <div className="ce-empty">
              <img className="ce-empty-img" src="/assets/icons/emptychannelcontent.svg" alt="" />
              <div className="ce-empty-title">This channel is nothing without content</div>
              <div className="ce-empty-sub">
                Add your playlists or individual pieces of content and schedule them for something great.
              </div>
              <button className="btn btn-ghost" onClick={() => setContentPickerOpen(true)} type="button">
                Add Content
              </button>
            </div>
          ) : (
            <div className="ce-zoneList">
              <div className="ce-zoneList-title">Zone content ({activeZoneId})</div>

              <div className="ce-zoneList-card">
                {activeZoneItems.length === 0 ? (
                  <div className="ce-zoneList-empty">No items in this zone.</div>
                ) : (
                  activeZoneItems.map((it, idx) => {
                    const thumb = getItemThumb(it);
                    const dur =
                      it.sourceType === "playlist"
                        ? (playlistMeta[it.sourceId]?.totalDurationSec ?? it.durationSec)
                        : getEffectiveDuration(it);

                    const isPlaylist = it.sourceType === "playlist";
                    const isVideo = it.sourceType === "media" && it.mediaType === "video";
                    const isImage = it.sourceType === "media" && it.mediaType === "image";
                    const meta = it.sourceType === "media" ? mediaMeta[it.sourceId] : undefined;
                    const mediaUrl = meta?.url ?? null;
                    const schedules = getItemSchedules(it);

                    return (
                      <div key={it.id} className={`ce-zoneRow ${idx === activeZoneItems.length - 1 ? "is-last" : ""}`}>
                        {/* Thumbnail */}
                        <button type="button" onClick={() => openPreview(it)} className="ce-zoneThumbBtn" title="Preview">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="ce-zoneThumbMedia"
                              onError={(e) => {
                                const img = e.currentTarget as HTMLImageElement;
                                if (isImage && mediaUrl && img.src !== mediaUrl) {
                                  img.src = mediaUrl;
                                  return;
                                }
                                img.style.display = "none";
                              }}
                            />
                          ) : isVideo && mediaUrl ? (
                            <video
                              src={mediaUrl}
                              muted
                              preload="metadata"
                              className="ce-zoneThumbMedia"
                              onLoadedMetadata={(e) => {
                                const d = Math.round((e.currentTarget as HTMLVideoElement).duration || 0);
                                if (d > 0) {
                                  setMediaMeta((prev) => ({
                                    ...prev,
                                    [it.sourceId]: {
                                      ...(prev[it.sourceId] ?? {}),
                                      durationSec: d,
                                      mediaType: "video",
                                      url: mediaUrl,
                                    },
                                  }));
                                }
                              }}
                            />
                          ) : it.sourceType === "playlist" ? (
                            <div className="ce-zoneThumbFallback">
                              <img
                                src="/assets/icons/playlist.svg"
                                alt="Playlist"
                                className="ce-zoneThumbPlaylistIcon"
                                draggable={false}
                              />
                            </div>
                          ) : (
                            <div className="ce-zoneThumbText">{it.mediaType?.toUpperCase() ?? "MEDIA"}</div>
                          )}
                        </button>

                        {/* Middle */}
                        <div className="ce-zoneMid">
                          <div className="ce-zoneItemName">{it.name}</div>

                          <div className="ce-zoneDurationRow">
                            <input
                              type="text"
                              className={`ce-zoneDurationInput ${isVideo || isPlaylist ? "is-readonly" : ""}`}
                              value={formatHMS(dur)}
                              onChange={(e) => {
                                if (isVideo || isPlaylist) return;
                                const next = parseHMS(e.target.value);
                                if (next != null) updateItemInZone(activeZoneId, it.id, { durationSec: Math.max(1, next) });
                              }}
                              onBlur={(e) => {
                                if (isVideo) return;
                                const next = parseHMS(e.target.value);
                                updateItemInZone(activeZoneId, it.id, { durationSec: Math.max(1, next ?? dur) });
                              }}
                              title={isVideo ? "Video duration (not editable)" : "Duration (HH:MM:SS)"}
                              readOnly={isVideo || isPlaylist}
                            />
                          </div>
                        </div>

                        {/* Right */}
                        <div className="ce-zoneRight">
                          <div className="ce-zoneSchedules">
                            <div className="ce-zoneSchedulesList">
                              {schedules.map((sch) => (
                                <div key={sch.id} className="ce-zoneScheduleRow">
                                  <button
                                    type="button"
                                    onClick={(e) => openScheduleModal(it.id, sch.id, e.currentTarget)}
                                    className="ce-zoneScheduleBadge"
                                    title="Edit schedule"
                                  >
                                    {scheduleBadgeLabel(sch)}
                                  </button>
                                  <div className="ce-zoneScheduleSub">{scheduleSubtitle(sch)}</div>
                                </div>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={() => addScheduleRow(activeZoneId, it.id)}
                              className="ce-zoneAddSchedule"
                            >
                              + Add schedule
                            </button>
                          </div>

                          <div className="ce-zoneActions">
                            <button
                              type="button"
                              onClick={() => deleteItemFromZone(activeZoneId, it.id)}
                              aria-label="Delete"
                              title="Delete"
                              className="ce-zoneIconBtn"
                            >
                              🗑
                            </button>

                            <button
                              type="button"
                              aria-label="Drag"
                              title="Reorder (drag UI placeholder)"
                              className="ce-zoneIconBtn ce-zoneDragBtn"
                              onMouseDown={(e) => e.preventDefault()}
                            >
                              ☰
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Schedule modal */}
              {scheduleOpen && scheduleModalItem && scheduleModalSchedule && scheduleForItemId && scheduleForScheduleId && (
                <ScheduleModal
                  open={scheduleOpen}
                  anchorRect={scheduleAnchorRect}
                  itemName={scheduleModalItem.name}
                  schedule={scheduleModalSchedule}
                  onClose={() => closeScheduleModal()}
                  onChange={(next) => updateScheduleRow(activeZoneId, scheduleForItemId, scheduleForScheduleId, next)}
                  onDelete={() => {
                    deleteScheduleRow(activeZoneId, scheduleForItemId, scheduleForScheduleId);
                    closeScheduleModal();
                  }}
                />
              )}
            </div>
          )}
        </div>


        <div className="ce-side">
          <div className="ce-side-tabs">
            <button
              className={`ce-side-tab ${panelTab === "layout" ? "is-active" : ""}`}
              onClick={() => setPanelTab("layout")}
              type="button"
            >
              LAYOUT
            </button>
            <button
              className={`ce-side-tab ${panelTab === "settings" ? "is-active" : ""}`}
              onClick={() => setPanelTab("settings")}
              type="button"
            >
              SETTINGS
            </button>
          </div>

          {panelTab === "layout" ? (
            <div className="ce-side-section">
              <div className="ce-side-row">
                <div>
                  <div className="ce-dim-label">Dimension</div>
                  <div className="ce-dim-value">{dimLabel}</div>
                </div>

                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setChannelSizeOpen(true);
                    setPendingDim({ w: width, h: height });
                  }}
                  type="button"
                >
                  Change
                </button>
              </div>

              <div className="ce-layout-preview">
                <div className="ce-layout-thumb-wrap" onMouseLeave={() => setHover({ txt: null, x: 0, y: 0 })}>
                  <LayoutThumb
                    layout={layout}
                    width={width}
                    height={height}
                    activeZoneId={hoverZoneId ?? (activeZoneId === "background_audio" ? undefined : activeZoneId)}
                    onHover={(txt, x, y) => setHover({ txt, x, y })}
                    onZoneHoverId={setHoverZoneId}
                    onZoneSelectId={(zid) => setActiveZoneId(zid)}
                    showBadges={false}
                  />
                </div>

                <button className="btn btn-ghost" onClick={() => setLayoutModalOpen(true)} type="button">
                  Edit Layout
                </button>
              </div>

              <div className="ce-zone-block">
                <div className="ce-zone-title">ZONE</div>
                <div className="ce-zone-pill">
                  <div className="ce-zone-num">
                    {activeZoneId === "background_audio"
                      ? "♪"
                      : String(Math.max(1, layout.zones.findIndex((z) => z.id === activeZoneId) + 1))}
                  </div>
                  <div className="ce-zone-name">{activeZone.name}</div>
                </div>

                {activeZoneId === "background_audio" && (
                  <div className="ce-bg-audio-hint">
                    This zone allows for audio playing in the background. Adding video or any content with visuals in
                    this zone, will play the audio-only.
                  </div>
                )}
              </div>

              <div className="ce-tip">Tip: Hover zones in the preview to see pixel dimensions.</div>
            </div>
          ) : (
            <div className="ce-side-section">
              <div className="ce-zone-block">
                <div className="ce-zone-title">ZONE</div>
                <div className="ce-zone-pill">
                  <div className="ce-zone-num">
                    {activeZoneId === "background_audio"
                      ? "♪"
                      : String(Math.max(1, layout.zones.findIndex((z) => z.id === activeZoneId) + 1))}
                  </div>
                  <div className="ce-zone-name">{activeZone.name}</div>
                </div>
              </div>

              <div className="ce-settings-card">
                <div className="ce-settings-row">
                  <div className="ce-settings-label">
                    Enable Transition <span className="ce-q">?</span>
                  </div>

                  <button
                    className={`ce-toggle ${activeTransition.enabled ? "is-on" : ""}`}
                    onClick={() => updateActiveTransition({ enabled: !activeTransition.enabled })}
                    aria-label="Enable Transition"
                    type="button"
                  >
                    <span className="ce-toggle-knob" />
                  </button>
                </div>

                <div className={`ce-settings-fields ${activeTransition.enabled ? "" : "is-disabled"}`}>
                  <label className="ce-field">
                    <div className="ce-field-label">Transition</div>
                    <select
                      value={activeTransition.type}
                      onChange={(e) => {
                        const next = e.target.value as TransitionMain;

                        if (next === "cut") updateActiveTransition({ type: "cut", durationSec: 0 });
                        if (next === "fade") updateActiveTransition({ type: "fade", durationSec: 0.5, color: "#000000" });
                        if (next === "slide")
                          updateActiveTransition({
                            type: "slide",
                            durationSec: 0.6,
                            direction: "right",
                            easing: "ease-in-out",
                          });
                        if (next === "push") updateActiveTransition({ type: "push", durationSec: 0.6, direction: "right" });
                        if (next === "wipe") updateActiveTransition({ type: "wipe", durationSec: 0.6, direction: "right" });
                        if (next === "zoom")
                          updateActiveTransition({ type: "zoom", durationSec: 0.6, zoomMode: "in", zoomStartScale: 0.9 });
                      }}
                      disabled={!activeTransition.enabled}
                    >
                      <option value="cut">Cut (Instant)</option>
                      <option value="fade">Fade</option>
                      <option value="slide">Slide</option>
                      <option value="push">Push</option>
                      <option value="wipe">Wipe</option>
                      <option value="zoom">Zoom</option>
                    </select>
                  </label>

                  {activeTransition.type !== "cut" && (
                    <label className="ce-field">
                      <div className="ce-field-label">Duration</div>
                      <div className="ce-duration">
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={activeTransition.durationSec}
                          onChange={(e) => updateActiveTransition({ durationSec: Number(e.target.value) })}
                          disabled={!activeTransition.enabled}
                        />
                        <div className="ce-unit">s</div>
                      </div>
                    </label>
                  )}

                  {activeTransition.type === "fade" && (
                    <label className="ce-field">
                      <div className="ce-field-label">Fade Color</div>
                      <div className="ce-color">
                        <input
                          type="color"
                          value={activeTransition.color}
                          onChange={(e) => updateActiveTransition({ color: e.target.value })}
                          disabled={!activeTransition.enabled}
                        />
                        <input
                          className="ce-color-hex"
                          value={activeTransition.color}
                          onChange={(e) => updateActiveTransition({ color: e.target.value })}
                          disabled={!activeTransition.enabled}
                        />
                      </div>
                    </label>
                  )}

                  {(activeTransition.type === "slide" || activeTransition.type === "push" || activeTransition.type === "wipe") && (
                    <label className="ce-field">
                      <div className="ce-field-label">Direction</div>
                      <select
                        value={activeTransition.direction ?? "right"}
                        onChange={(e) => updateActiveTransition({ direction: e.target.value as TransitionDirection })}
                        disabled={!activeTransition.enabled}
                      >
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                        <option value="up">Up</option>
                        <option value="down">Down</option>
                      </select>
                    </label>
                  )}

                  {activeTransition.type === "slide" && (
                    <label className="ce-field">
                      <div className="ce-field-label">Easing</div>
                      <select
                        value={activeTransition.easing ?? "ease-in-out"}
                        onChange={(e) => updateActiveTransition({ easing: e.target.value as TransitionEasing })}
                        disabled={!activeTransition.enabled}
                      >
                        <option value="ease-in-out">ease-in-out</option>
                        <option value="linear">linear</option>
                      </select>
                    </label>
                  )}

                  {activeTransition.type === "zoom" && (
                    <>
                      <label className="ce-field">
                        <div className="ce-field-label">Zoom</div>
                        <select
                          value={activeTransition.zoomMode ?? "in"}
                          onChange={(e) => updateActiveTransition({ zoomMode: e.target.value as ZoomMode })}
                          disabled={!activeTransition.enabled}
                        >
                          <option value="in">In</option>
                          <option value="out">Out</option>
                        </select>
                      </label>

                      <label className="ce-field">
                        <div className="ce-field-label">Start Scale</div>
                        <input
                          type="number"
                          min={0.5}
                          max={1.5}
                          step={0.05}
                          value={activeTransition.zoomStartScale ?? 0.9}
                          onChange={(e) => updateActiveTransition({ zoomStartScale: Number(e.target.value) })}
                          disabled={!activeTransition.enabled}
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>

              <div className="ce-tip">Note: current backend saves a single channel-level transition.</div>
            </div>
          )}
        </div>
      </div>

      {hover.txt && (
        <div className="ce-hover-tip" style={{ left: hover.x, top: hover.y }}>
          {hover.txt.split("\n").map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}

<MediaPreviewModal
  open={previewOpen}
  item={previewItem}
  meta={previewItem?.sourceType === "media" ? mediaMeta[previewItem.sourceId] : undefined}
  onClose={closePreview}
  onDelete={() => {
    if (!previewItem) return;
    deleteItemFromZone(activeZoneId, previewItem.id); // delete from the CURRENT zone list
    closePreview();
  }}
  onDownload={(url, filename) => downloadUrlToFile(url, filename)}
/>


      <ChannelSizeModal
        open={channelSizeOpen}
        current={{ w: width, h: height }}
        value={pendingDim}
        presets={DIM_PRESETS}
        onChange={(next) => setPendingDim(next)}
        onClose={() => setChannelSizeOpen(false)}
        onConfirm={() => {
          setWidth(pendingDim.w);
          setHeight(pendingDim.h);
          setChannelSizeOpen(false);
        }}
      />

      <ChooseLayoutModal
        open={layoutModalOpen}
        layouts={ALL_LAYOUTS}
        currentLayoutId={layoutId}
        width={width}
        height={height}
        onClose={() => setLayoutModalOpen(false)}
        onSelect={(nextId) => {
          setLayoutId(nextId);
          setLayoutModalOpen(false);
        }}
        onCustomize={() => {
          setLayoutModalOpen(false);
        }}
      />

      <ChannelContentPickerModal
        open={contentPickerOpen}
        onClose={() => setContentPickerOpen(false)}
        onConfirm={(items: PickerResult[]) => {
          // assign picked items to the active zone
          setZoneContents((prev) => {
            const zoneId = activeZoneId;
            const existing = prev[zoneId] ?? [];

            const mapped: ZoneContentItem[] = items.map((it, idx) => {
              const sourceType = it.type as "media" | "playlist";
              const sourceId = it.item.id;

              const name = (it.item as any)?.name ?? (it.item as any)?.title ?? "(untitled)";

              const mediaType =
                sourceType === "media" ? (((it.item as any)?.type as "image" | "video" | undefined) ?? undefined) : undefined;

              const thumb =
                (it.item as any)?.thumbnailUrl ??
                (it.item as any)?.thumbUrl ??
                (it.item as any)?.thumbnail ??
                (it.item as any)?.previewUrl ??
                (it.item as any)?.url ??
                null;

              const pickedDur =
                typeof (it.item as any)?.durationSec === "number"
                  ? (it.item as any)?.durationSec
                  : typeof (it.item as any)?.duration === "number"
                  ? (it.item as any)?.duration
                  : typeof (it.item as any)?.durationMs === "number"
                  ? Math.round((it.item as any)?.durationMs / 1000)
                  : null;

              const durationSec =
                sourceType === "media"
                  ? mediaType === "image"
                    ? 10
                    : typeof pickedDur === "number" && pickedDur > 0
                    ? pickedDur
                    : 0 // will be resolved from meta fetch
                  : 10;

              const schedules = [defaultSchedule()];

              const next: ZoneContentItem = {
                id: crypto.randomUUID(),
                sourceType,
                sourceId,
                name,
                mediaType,
                durationSec,
                order: existing.length + idx,
                startAt: null,
                endAt: null,
                thumbnailUrl: thumb,
                schedules,
                schedule: schedules[0],
              };

              return next;
            });

            return {
              ...prev,
              [zoneId]: [...existing, ...mapped],
            };
          });
          clearNoop(setSaveStatus);
          // resolve media meta for new media items (thumbnail + video duration)
          for (const it of items) {
            if (it.type === "media") void resolveMediaMeta(it.item.id);
          }

          setContentPickerOpen(false);
        }}
      />
    </div>
  );
}
