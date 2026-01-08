import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./ChannelEditorPage.css";
import { coverFromSeed, getChannelCoverSeed } from "./channelCover";

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

  // Backend returns "default" in your curl
  layoutId: string;

  // Backend returns `transition`, not per-zone transitions
  transition?: ApiChannelTransition;

  // Optional: if backend adds these later, we support them
  width?: number;
  height?: number;

  // Optional future support
  zoneTransitions?: Record<string, ZoneTransition>;
};

type Zone = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type LayoutDef = {
  id: string;
  name: string;
  zones: Zone[];
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
    // try JSON error
    try {
      const parsed = txt ? JSON.parse(txt) : null;
      const msg = parsed?.message || `${res.status} ${res.statusText}`;
      throw new ApiError(msg, { status: res.status, url, bodySnippet });
    } catch {
      const msg = txt?.trim() ? txt.trim() : `${res.status} ${res.statusText}`;
      throw new ApiError(msg, { status: res.status, url, bodySnippet });
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

function humanizeError(e: any): string {
  const msg = String(e?.message ?? "Unknown error").trim();

  // If the server returned HTML, do not print the HTML in UI
  if (msg.toLowerCase().includes("received html")) return msg;

  // Nginx/Express typical route errors
  if (msg.toLowerCase().includes("cannot patch")) return "PATCH not supported on this API route.";
  if (msg.toLowerCase().includes("cannot put")) return "PUT not supported on this API route.";
  if (msg.toLowerCase().includes("not allowed") || e?.status === 405) return "Method not allowed (405).";

  return msg;
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

  // Common nesting patterns
  const candidates = [
    obj.user,
    obj.profile,
    obj.account,
    obj.auth,
    obj.session,
    obj.me,
    obj.currentUser,
  ];

  for (const c of candidates) {
    const lbl = deepFindUserLabel(c, depth - 1);
    if (lbl) return lbl;
  }

  // Scan keys that often hold user info
  for (const k of Object.keys(obj)) {
    if (/(user|profile|account|auth|session|me|identity)/i.test(k)) {
      const lbl = deepFindUserLabel(obj[k], depth - 1);
      if (lbl) return lbl;
    }
  }

  return undefined;
}

function readCurrentUserLabel(): string | undefined {
  // 1) localStorage + sessionStorage (common auth implementations)
  const storages: Storage[] = [];

if (typeof window !== "undefined") {
  try {
    storages.push(window.localStorage);
  } catch {
    // ignore
  }
  try {
    storages.push(window.sessionStorage);
  } catch {
    // ignore
  }
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
    // redux persist
    "persist:root",
    "reduxPersist:root",
  ];

  for (const st of storages) {
    for (const k of userKeys) {
      try {
        const raw = st.getItem(k);
        if (!raw) continue;

        // redux-persist root is an object of slices (often JSON strings)
        if (k === "persist:root" || k === "reduxPersist:root") {
          const root = safeJsonParse(raw);
          if (root && typeof root === "object") {
            const lblRoot = deepFindUserLabel(root);
            if (lblRoot) return lblRoot;

            for (const sliceKey of Object.keys(root)) {
              const sliceRaw = root[sliceKey];
              // slices are often JSON strings
              const sliceObj = typeof sliceRaw === "string" ? safeJsonParse(sliceRaw) : sliceRaw;
              const lblSlice = deepFindUserLabel(sliceObj);
              if (lblSlice) return lblSlice;
            }
          }
          continue;
        }

        // normal objects
        const obj = safeJsonParse(raw);
        const lbl = deepFindUserLabel(obj) || userLabelFromAny(obj);
        if (lbl) return lbl;

        // sometimes raw is just an email/username string
        if (typeof raw === "string" && raw.includes("@")) return raw;
      } catch {
        // ignore
      }
    }
  }

  // 2) JWT payload from common keys
  const tokenKeys = [
    "access_token",
    "accessToken",
    "token",
    "authToken",
    "id_token",
    "idToken",
    "jwt",
  ];

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
          payload?.name ||
          payload?.fullName ||
          payload?.preferred_username ||
          payload?.username ||
          payload?.email;

        if (label) return label;
      } catch {
        // ignore
      }
    }
  }

  // 3) Non-HttpOnly cookies (if you set them)
  const cookieKeys = ["user", "currentUser", "authUser", "profile", "me", "username", "email"];
  for (const ck of cookieKeys) {
    const v = cookieGet(ck);
    const obj = safeJsonParse(v ?? null);
    const lbl = deepFindUserLabel(obj) || userLabelFromAny(obj) || v;
    if (lbl) return lbl;
  }

  // 4) Global bootstrapped state (some apps expose it)
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

  // common shapes
  if (typeof v === "object") {
    return (
      v.name ||
      v.fullName ||
      v.displayName ||
      v.username ||
      v.email ||
      v.user?.name ||
      v.user?.fullName ||
      v.user?.displayName ||
      v.user?.username ||
      v.user?.email
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
    // sometimes the backend returns audit metadata
    userLabelFromAny(ch.audit?.updatedBy) ||
    userLabelFromAny(ch.meta?.updatedBy) ||
    // fallback (if backend only returns createdBy)
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
function useShowingOutsideClick<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  onOutside: () => void
) {
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

/**
 * Layouts (unchanged from your current file)
 */
const ALL_LAYOUTS: LayoutDef[] = [
  { id: "layout_main", name: "Main", zones: [{ id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 100 }] },
  {
    id: "layout_main_footer",
    name: "Main + Footer",
    zones: [
      { id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 78 },
      { id: "z2", name: "Footer", x: 0, y: 78, w: 100, h: 22 },
    ],
  },
  {
    id: "layout_split_vertical",
    name: "Split Vertically",
    zones: [
      { id: "z1", name: "Left", x: 0, y: 0, w: 50, h: 100 },
      { id: "z2", name: "Right", x: 50, y: 0, w: 50, h: 100 },
    ],
  },
  {
    id: "layout_split_horizontal",
    name: "Split Horizontally",
    zones: [
      { id: "z1", name: "Top", x: 0, y: 0, w: 100, h: 50 },
      { id: "z2", name: "Bottom", x: 0, y: 50, w: 100, h: 50 },
    ],
  },
  {
    id: "layout_left_bar",
    name: "Main + Left Bar",
    zones: [
      { id: "z1", name: "Side Zone", x: 0, y: 0, w: 24, h: 100 },
      { id: "z2", name: "Main Zone", x: 24, y: 0, w: 76, h: 100 },
    ],
  },
  {
    id: "layout_right_bar",
    name: "Main + Right Bar",
    zones: [
      { id: "z1", name: "Main Zone", x: 0, y: 0, w: 76, h: 100 },
      { id: "z2", name: "Side Zone", x: 76, y: 0, w: 24, h: 100 },
    ],
  },
  {
    id: "layout_triple_vertical",
    name: "Triple Vertically",
    zones: [
      { id: "z1", name: "Left", x: 0, y: 0, w: 33.33, h: 100 },
      { id: "z2", name: "Center", x: 33.33, y: 0, w: 33.33, h: 100 },
      { id: "z3", name: "Right", x: 66.66, y: 0, w: 33.34, h: 100 },
    ],
  },
  {
    id: "layout_triple_horizontal",
    name: "Triple Horizontally",
    zones: [
      { id: "z1", name: "Top", x: 0, y: 0, w: 100, h: 33.33 },
      { id: "z2", name: "Middle", x: 0, y: 33.33, w: 100, h: 33.33 },
      { id: "z3", name: "Bottom", x: 0, y: 66.66, w: 100, h: 33.34 },
    ],
  },
  {
    id: "layout_main_left_footer",
    name: "Main + Left Bar & Footer",
    zones: [
      { id: "z1", name: "Left Bar", x: 0, y: 0, w: 24, h: 78 },
      { id: "z2", name: "Main Zone", x: 24, y: 0, w: 76, h: 78 },
      { id: "z3", name: "Footer", x: 0, y: 78, w: 100, h: 22 },
    ],
  },
  {
    id: "layout_main_left_header",
    name: "Main + Left Bar & Header",
    zones: [
      { id: "z1", name: "Header", x: 0, y: 0, w: 100, h: 18 },
      { id: "z2", name: "Left Bar", x: 0, y: 18, w: 24, h: 82 },
      { id: "z3", name: "Main Zone", x: 24, y: 18, w: 76, h: 82 },
    ],
  },
  {
    id: "layout_main_right_footer",
    name: "Main + Right Bar & Footer",
    zones: [
      { id: "z1", name: "Main Zone", x: 0, y: 0, w: 76, h: 78 },
      { id: "z2", name: "Right Bar", x: 76, y: 0, w: 24, h: 78 },
      { id: "z3", name: "Footer", x: 0, y: 78, w: 100, h: 22 },
    ],
  },
  {
    id: "layout_main_right_header",
    name: "Main + Right Bar & Header",
    zones: [
      { id: "z1", name: "Header", x: 0, y: 0, w: 100, h: 18 },
      { id: "z2", name: "Main Zone", x: 0, y: 18, w: 76, h: 82 },
      { id: "z3", name: "Right Bar", x: 76, y: 18, w: 24, h: 82 },
    ],
  },
  {
    id: "layout_2zones",
    name: "2 Zones layout",
    zones: [
      { id: "z1", name: "Zone 1", x: 0, y: 0, w: 75, h: 100 },
      { id: "z2", name: "Zone 2", x: 75, y: 0, w: 25, h: 100 },
    ],
  },
  {
    id: "layout_3zones",
    name: "3 Zones layout",
    zones: [
      { id: "z1", name: "Zone 1", x: 0, y: 0, w: 70, h: 80 },
      { id: "z2", name: "Zone 2", x: 70, y: 0, w: 30, h: 80 },
      { id: "z3", name: "Footer", x: 0, y: 80, w: 100, h: 20 },
    ],
  },
  {
    id: "layout_4zones",
    name: "4 Zones layout",
    zones: [
      { id: "z1", name: "Main Zone", x: 0, y: 0, w: 70, h: 100 },
      { id: "z2", name: "Side 1", x: 70, y: 0, w: 30, h: 33.33 },
      { id: "z3", name: "Side 2", x: 70, y: 33.33, w: 30, h: 33.33 },
      { id: "z4", name: "Side 3", x: 70, y: 66.66, w: 30, h: 33.34 },
    ],
  },
  {
    id: "layout_5zones",
    name: "5 Zones layout",
    zones: [
      { id: "z1", name: "Main Zone", x: 0, y: 0, w: 78, h: 100 },
      { id: "z2", name: "Right 1", x: 78, y: 0, w: 22, h: 33.33 },
      { id: "z3", name: "Right 2", x: 78, y: 33.33, w: 22, h: 33.33 },
      { id: "z4", name: "Right 3", x: 78, y: 66.66, w: 22, h: 33.34 },
      { id: "z5", name: "Header", x: 0, y: 0, w: 100, h: 0 },
    ].filter((z) => z.w > 0 && z.h > 0),
  },
  {
    id: "layout_main_upper",
    name: "Main + Upper Pane",
    zones: [
      { id: "z1", name: "Upper Pane", x: 0, y: 0, w: 100, h: 22 },
      { id: "z2", name: "Main Zone", x: 0, y: 22, w: 100, h: 78 },
    ],
  },
  {
    id: "layout_main_lower",
    name: "Main + Lower Pane",
    zones: [
      { id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 78 },
      { id: "z2", name: "Lower Pane", x: 0, y: 78, w: 100, h: 22 },
    ],
  },
  {
    id: "layout_video_frame",
    name: "Video Frame",
    zones: [
      { id: "z1", name: "Main Zone", x: 8, y: 10, w: 84, h: 80 },
      { id: "z2", name: "Frame", x: 0, y: 0, w: 100, h: 100 },
    ],
  },
  {
    id: "layout_ticker",
    name: "1 Main Zone + Ticker",
    zones: [
      { id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 84 },
      { id: "z2", name: "Tickertape", x: 0, y: 84, w: 100, h: 16 },
    ],
  },
  {
    id: "layout_left_triple_bar",
    name: "Main + Left Triple Bar",
    zones: [
      { id: "z1", name: "Left 1", x: 0, y: 0, w: 22, h: 33.33 },
      { id: "z2", name: "Left 2", x: 0, y: 33.33, w: 22, h: 33.33 },
      { id: "z3", name: "Left 3", x: 0, y: 66.66, w: 22, h: 33.34 },
      { id: "z4", name: "Main Zone", x: 22, y: 0, w: 78, h: 100 },
    ],
  },
  {
    id: "layout_right_triple_bar",
    name: "Main + Right Triple Bar",
    zones: [
      { id: "z1", name: "Main Zone", x: 0, y: 0, w: 78, h: 100 },
      { id: "z2", name: "Right 1", x: 78, y: 0, w: 22, h: 33.33 },
      { id: "z3", name: "Right 2", x: 78, y: 33.33, w: 22, h: 33.33 },
      { id: "z4", name: "Right 3", x: 78, y: 66.66, w: 22, h: 33.34 },
    ],
  },
  {
    id: "layout_split_v_footer",
    name: "Split Vertically + Footer",
    zones: [
      { id: "z1", name: "Left", x: 0, y: 0, w: 50, h: 80 },
      { id: "z2", name: "Right", x: 50, y: 0, w: 50, h: 80 },
      { id: "z3", name: "Footer", x: 0, y: 80, w: 100, h: 20 },
    ],
  },
  {
    id: "layout_split_h_right",
    name: "Split Horizontally + Right Bar",
    zones: [
      { id: "z1", name: "Top", x: 0, y: 0, w: 76, h: 50 },
      { id: "z2", name: "Bottom", x: 0, y: 50, w: 76, h: 50 },
      { id: "z3", name: "Right Bar", x: 76, y: 0, w: 24, h: 100 },
    ],
  },
  {
    id: "layout_picture_in_picture",
    name: "Picture-in-Picture",
    zones: [
      { id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 100 },
      { id: "z2", name: "Widget", x: 72, y: 8, w: 24, h: 24 },
    ],
  },
  {
    id: "layout_quadrants",
    name: "4 Quadrants",
    zones: [
      { id: "z1", name: "Top Left", x: 0, y: 0, w: 50, h: 50 },
      { id: "z2", name: "Top Right", x: 50, y: 0, w: 50, h: 50 },
      { id: "z3", name: "Bottom Left", x: 0, y: 50, w: 50, h: 50 },
      { id: "z4", name: "Bottom Right", x: 50, y: 50, w: 50, h: 50 },
    ],
  },
  {
    id: "layout_header_main_footer",
    name: "Header + Main + Footer",
    zones: [
      { id: "z1", name: "Header", x: 0, y: 0, w: 100, h: 18 },
      { id: "z2", name: "Main Zone", x: 0, y: 18, w: 100, h: 64 },
      { id: "z3", name: "Footer", x: 0, y: 82, w: 100, h: 18 },
    ],
  },
  {
    id: "layout_header_split",
    name: "Header + Split",
    zones: [
      { id: "z1", name: "Header", x: 0, y: 0, w: 100, h: 18 },
      { id: "z2", name: "Left", x: 0, y: 18, w: 50, h: 82 },
      { id: "z3", name: "Right", x: 50, y: 18, w: 50, h: 82 },
    ],
  },
];

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
  // if backend already stores our ids, keep
  if (layoutId.startsWith("layout_")) return layoutId;
  return "layout_main";
}

/** Map UI layoutId -> backend layoutId */
function uiLayoutToApi(layoutId: string): string {
  // keep backend default for main
  if (layoutId === "layout_main") return "default";
  return layoutId;
}

/** Map backend transition -> UI transition (stored on zone z1) */
function apiTransitionToUi(t?: ApiChannelTransition): ZoneTransition {
  const base = defaultTransition();
  if (!t) return base;

  const type = String(t.type ?? "").toLowerCase();
  const enabled = Boolean(t.enabled);

  // backend uses slide, maybe fade
  if (!enabled) {
    return { ...base, enabled: false, type: "cut", durationSec: 0 };
  }

  if (type === "fade") {
    return { ...base, enabled: true, type: "fade", durationSec: Number(t.duration ?? 0.5), color: "#000000" };
  }

  // treat everything else as slide
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
    // safest fallback: fade (most compatible)
    return { enabled: true, type: "fade", duration: Number(t.durationSec || 0.5) };
  }

  // slide/push/wipe -> slide
  return {
    enabled: true,
    type: "slide",
    duration: Number(t.durationSec || 0.5),
    direction: t.direction || "right",
  };
}

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
  const [hover, setHover] = useState<{ txt: string | null; x: number; y: number }>({
    txt: null,
    x: 0,
    y: 0,
  });

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

export default function ChannelEditorPage() {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const [hover, setHover] = useState<{ txt: string | null; x: number; y: number }>({
    txt: null,
    x: 0,
    y: 0,
  });

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
  const saveStatusTimerRef = useRef<number | null>(null);
  const lastSavedSnapshotRef = useRef<string>("");

  const layout = useMemo(() => ALL_LAYOUTS.find((l) => l.id === layoutId) ?? ALL_LAYOUTS[0], [layoutId]);

  const zones = useMemo(() => {
    const base = layout.zones.map((z) => ({ ...z }));
    return [...base, { id: "background_audio", name: "Background Audio", x: 0, y: 0, w: 0, h: 0 }];
  }, [layout.zones]);

  const activeZone = useMemo(() => zones.find((z) => z.id === activeZoneId) ?? zones[0], [zones, activeZoneId]);

  useEffect(() => {
    // ensure active zone always valid when layout changes
    const zoneIds = new Set(zones.map((z) => z.id));
    if (!zoneIds.has(activeZoneId)) setActiveZoneId(zones[0].id);

    // ensure transitions entry exists for all zones
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
    });
  }, [layoutId, width, height, zoneTransitions]);

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
      // IMPORTANT: only use /api/channels (never /channels which is SPA HTML)
      const r = await fetchJsonStrict<{ item: Channel }>(`${API_BASE}/${id}`, { method: "GET" });
      //const ch = r.item;
      //setChannel(ch);
      const ch = r.item;
const fallbackBy = readCurrentUserLabel();
setChannel({
  ...ch,
  updatedBy: getUpdatedByLabel(ch) || fallbackBy || ch.updatedBy,
} as any);

      const uiLayoutId = apiLayoutToUi(ch.layoutId);
      const initialLayout = ALL_LAYOUTS.find((l) => l.id === uiLayoutId) ?? ALL_LAYOUTS[0];

      const initialWidth = ch.width || 1920;
      const initialHeight = ch.height || 1080;

      setLayoutId(uiLayoutId);
      setWidth(initialWidth);
      setHeight(initialHeight);

      // set transitions: if backend has zoneTransitions, use them, else map channel.transition to z1
      const nextTransitions: Record<string, ZoneTransition> = {
        z1: apiTransitionToUi(ch.transition),
        background_audio: defaultTransition(),
      };

      // ensure all zones have an entry
      for (const z of [...initialLayout.zones.map((z) => z.id), "background_audio"]) {
        if (!nextTransitions[z]) nextTransitions[z] = defaultTransition();
      }
      setZoneTransitions(nextTransitions);

      setActiveZoneId(initialLayout.zones[0]?.id ?? "z1");

      // baseline snapshot
      lastSavedSnapshotRef.current = JSON.stringify({
        layoutId: uiLayoutId,
        width: initialWidth,
        height: initialHeight,
        zoneTransitions: nextTransitions,
      });
    } catch (e: any) {
      setError(`Failed to load channel. ${humanizeError(e)}`.trim());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  //const cover = useMemo(() => coverFromId(id || "seed"), [id]);
  
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

    if (!isDirty) {
      setSaveStatus("noop");
      return;
    }

    setSaveStatus("saving");
    setError(null);
    
    // Backend currently supports GET /api/channels/:id and returns `transition`.
    // We save layoutId + transition (derived from zone z1).
    const apiPayload = {
      layoutId: uiLayoutToApi(layoutId),
      transition: uiTransitionToApi(zoneTransitions.z1 ?? defaultTransition()),
      // keep width/height ready if backend accepts them later (safe to omit if you prefer)
      width,
      height,
    };

    const url = `${API_BASE}/${id}`;

    try {
      // Try PATCH first
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
	//setChannel(res.item);
      } catch (e: any) {
        // If PATCH not supported, try PUT
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

  const orientationLabel =
    channel?.orientation ? (channel.orientation === "landscape" ? "Landscape" : "Portrait") : "—";

  const byLabel = useMemo(() => {
  return getUpdatedByLabel(channel) || readCurrentUserLabel() || undefined;
}, [channel]);

const updatedLabel =
  channel?.updatedAt
    ? ` · Updated ${formatUpdated(channel.updatedAt)}${byLabel ? ` · By ${byLabel}` : ""}`
    : "";


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

            <button className="btn btn-ghost" onClick={() => {}} type="button">
              + Add Content
            </button>
          </div>

          <div className="ce-empty">
            <img className="ce-empty-img" src="/assets/icons/emptychannelcontent.svg" alt="" />
            <div className="ce-empty-title">This channel is nothing without content</div>
            <div className="ce-empty-sub">
              Add your playlists or individual pieces of content and schedule them for something great.
            </div>
            <button className="btn btn-ghost" onClick={() => {}} type="button">
              Add Content
            </button>
          </div>
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

                        // defaults by type
                        if (next === "cut") updateActiveTransition({ type: "cut", durationSec: 0 });
                        if (next === "fade") updateActiveTransition({ type: "fade", durationSec: 0.5, color: "#000000" });
                        if (next === "slide") updateActiveTransition({ type: "slide", durationSec: 0.6, direction: "right", easing: "ease-in-out" });
                        if (next === "push") updateActiveTransition({ type: "push", durationSec: 0.6, direction: "right" });
                        if (next === "wipe") updateActiveTransition({ type: "wipe", durationSec: 0.6, direction: "right" });
                        if (next === "zoom") updateActiveTransition({ type: "zoom", durationSec: 0.6, zoomMode: "in", zoomStartScale: 0.9 });
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

                  {(activeTransition.type === "slide" ||
                    activeTransition.type === "push" ||
                    activeTransition.type === "wipe") && (
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
    </div>
  );
}

