import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./ChannelEditorPage.css";

type Orientation = "landscape" | "portrait";

type Channel = {
  id: string;
  name: string;
  orientation: Orientation;
  createdAt: string;
  width: number;
  height: number;
  layoutId: string;
};

type Zone = {
  id: string;
  name: string;
  // percentage-based rect
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

type TransitionType =
  | "fade"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "zoom"
  | "none";

type ZoneTransition = {
  enabled: boolean;
  type: TransitionType;
  durationSec: number;
  color: string; // hex
};

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const txt = await res.text().catch(() => "");
  const data = txt ? JSON.parse(txt) : null;
  if (!res.ok) {
    const msg = data?.message || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data as T;
}

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
 * 29 layouts scaffold.
 * Coordinates are reasonable placeholders; you can refine later.
 * Key requirement: modal scroll + show all.
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
      { id: "z5", name: "Header", x: 0, y: 0, w: 100, h: 0 }, // kept to keep ID naming stable; filtered below
    ].filter((z) => z.w > 0 && z.h > 0),
  },

  { id: "layout_main_upper", name: "Main + Upper Pane", zones: [
    { id: "z1", name: "Upper Pane", x: 0, y: 0, w: 100, h: 22 },
    { id: "z2", name: "Main Zone", x: 0, y: 22, w: 100, h: 78 },
  ]},
  { id: "layout_main_lower", name: "Main + Lower Pane", zones: [
    { id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 78 },
    { id: "z2", name: "Lower Pane", x: 0, y: 78, w: 100, h: 22 },
  ]},
  { id: "layout_video_frame", name: "Video Frame", zones: [
    { id: "z1", name: "Main Zone", x: 8, y: 10, w: 84, h: 80 },
    { id: "z2", name: "Frame", x: 0, y: 0, w: 100, h: 100 },
  ]},
  { id: "layout_ticker", name: "1 Main Zone + Ticker", zones: [
    { id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 84 },
    { id: "z2", name: "Tickertape", x: 0, y: 84, w: 100, h: 16 },
  ]},
  { id: "layout_left_triple_bar", name: "Main + Left Triple Bar", zones: [
    { id: "z1", name: "Left 1", x: 0, y: 0, w: 22, h: 33.33 },
    { id: "z2", name: "Left 2", x: 0, y: 33.33, w: 22, h: 33.33 },
    { id: "z3", name: "Left 3", x: 0, y: 66.66, w: 22, h: 33.34 },
    { id: "z4", name: "Main Zone", x: 22, y: 0, w: 78, h: 100 },
  ]},
  { id: "layout_right_triple_bar", name: "Main + Right Triple Bar", zones: [
    { id: "z1", name: "Main Zone", x: 0, y: 0, w: 78, h: 100 },
    { id: "z2", name: "Right 1", x: 78, y: 0, w: 22, h: 33.33 },
    { id: "z3", name: "Right 2", x: 78, y: 33.33, w: 22, h: 33.33 },
    { id: "z4", name: "Right 3", x: 78, y: 66.66, w: 22, h: 33.34 },
  ]},
  { id: "layout_split_v_footer", name: "Split Vertically + Footer", zones: [
    { id: "z1", name: "Left", x: 0, y: 0, w: 50, h: 80 },
    { id: "z2", name: "Right", x: 50, y: 0, w: 50, h: 80 },
    { id: "z3", name: "Footer", x: 0, y: 80, w: 100, h: 20 },
  ]},
  { id: "layout_split_h_right", name: "Split Horizontally + Right Bar", zones: [
    { id: "z1", name: "Top", x: 0, y: 0, w: 76, h: 50 },
    { id: "z2", name: "Bottom", x: 0, y: 50, w: 76, h: 50 },
    { id: "z3", name: "Right Bar", x: 76, y: 0, w: 24, h: 100 },
  ]},
  { id: "layout_picture_in_picture", name: "Picture-in-Picture", zones: [
    { id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 100 },
    { id: "z2", name: "Widget", x: 72, y: 8, w: 24, h: 24 },
  ]},
  { id: "layout_quadrants", name: "4 Quadrants", zones: [
    { id: "z1", name: "Top Left", x: 0, y: 0, w: 50, h: 50 },
    { id: "z2", name: "Top Right", x: 50, y: 0, w: 50, h: 50 },
    { id: "z3", name: "Bottom Left", x: 0, y: 50, w: 50, h: 50 },
    { id: "z4", name: "Bottom Right", x: 50, y: 50, w: 50, h: 50 },
  ]},
  { id: "layout_header_main_footer", name: "Header + Main + Footer", zones: [
    { id: "z1", name: "Header", x: 0, y: 0, w: 100, h: 18 },
    { id: "z2", name: "Main Zone", x: 0, y: 18, w: 100, h: 64 },
    { id: "z3", name: "Footer", x: 0, y: 82, w: 100, h: 18 },
  ]},
  { id: "layout_header_split", name: "Header + Split", zones: [
    { id: "z1", name: "Header", x: 0, y: 0, w: 100, h: 18 },
    { id: "z2", name: "Left", x: 0, y: 18, w: 50, h: 82 },
    { id: "z3", name: "Right", x: 50, y: 18, w: 50, h: 82 },
  ]},
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

function px(n: number) {
  return `${Math.round(n)}px`;
}

function LayoutThumb({
  layout,
  width,
  height,
  onHover,
}: {
  layout: LayoutDef;
  width: number;
  height: number;
  onHover: (txt: string | null, x: number, y: number) => void;
}) {
  return (
    <div className="ce-layout-thumb">
      {layout.zones.map((z, idx) => (
        <div
          key={z.id}
          className="ce-zone"
          style={{
            left: `${z.x}%`,
            top: `${z.y}%`,
            width: `${z.w}%`,
            height: `${z.h}%`,
          }}
          onMouseEnter={(e) => {
            const pxW = Math.round((z.w / 100) * width);
            const pxH = Math.round((z.h / 100) * height);
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            onHover(`w:${pxW}\nh:${pxH}`, rect.left + rect.width / 2, rect.top);
          }}
          onMouseLeave={() => onHover(null, 0, 0)}
        >
          <div className="ce-zone-badge">{idx + 1}</div>
        </div>
      ))}
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

  const shown = tab === "all" ? layouts : []; // custom layouts later

  return (
    <div className="clm-backdrop" role="dialog" aria-modal="true">
      <div className="clm-modal">
        <div className="clm-header">
          <div className="clm-title-row">
            <div className="clm-title">Choose Layout</div>
            <button className="clm-close" onClick={onClose} aria-label="Close">×</button>
          </div>

          <div className="clm-tabs">
            <button className={`clm-tab ${tab === "all" ? "is-active" : ""}`} onClick={() => setTab("all")}>
              ALL LAYOUTS
            </button>
            <button className={`clm-tab ${tab === "custom" ? "is-active" : ""}`} onClick={() => setTab("custom")}>
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
                <LayoutThumb layout={l} width={width} height={height} onHover={(txt, x, y) => setHover({ txt, x, y })} />
                <div className="layout-name">{l.name}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="clm-footer">
          <button className="btn btn-ghost" onClick={onCustomize}>Customize</button>
          <button className="btn btn-primary" onClick={() => onSelect(picked)}>Select</button>
        </div>

        {hover.txt && (
          <div
            className="ce-hover-tip"
            style={{ left: hover.x, top: hover.y }}
          >
            {hover.txt.split("\n").map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DimensionModal({
  open,
  current,
  onClose,
  onPick,
}: {
  open: boolean;
  current: { w: number; h: number };
  onClose: () => void;
  onPick: (w: number, h: number) => void;
}) {
  const [picked, setPicked] = useState(`${current.w}x${current.h}`);

  useEffect(() => {
    if (open) setPicked(`${current.w}x${current.h}`);
  }, [open, current.w, current.h]);

  if (!open) return null;

  return (
    <div className="dim-backdrop" role="dialog" aria-modal="true">
      <div className="dim-modal">
        <div className="dim-header">
          <div className="dim-title">Choose Dimension</div>
          <button className="dim-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="dim-body">
          {DIM_PRESETS.map((p) => {
            const id = `${p.w}x${p.h}`;
            return (
              <label key={id} className={`dim-row ${picked === id ? "is-selected" : ""}`}>
                <input
                  type="radio"
                  name="dim"
                  value={id}
                  checked={picked === id}
                  onChange={() => setPicked(id)}
                />
                <div className="dim-label">{p.label}</div>
              </label>
            );
          })}
        </div>

        <div className="dim-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              const [w, h] = picked.split("x").map((x) => parseInt(x, 10));
              onPick(w, h);
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function defaultTransition(): ZoneTransition {
  return { enabled: false, type: "fade", durationSec: 0.5, color: "#000000" };
}

export default function ChannelEditorPage() {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [channel, setChannel] = useState<Channel | null>(null);

  // local UI state (can be persisted later)
  const [layoutId, setLayoutId] = useState<string>("layout_main");
  const [width, setWidth] = useState<number>(1920);
  const [height, setHeight] = useState<number>(1080);

  const [activeZoneId, setActiveZoneId] = useState<string>("z1");

  const [panelTab, setPanelTab] = useState<"layout" | "settings">("layout");

  const [layoutModalOpen, setLayoutModalOpen] = useState(false);
  const [dimModalOpen, setDimModalOpen] = useState(false);

  // top-right more menu
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  useShowingOutsideClick(moreRef, () => setMoreOpen(false));

  const [hover, setHover] = useState<{ txt: string | null; x: number; y: number }>({ txt: null, x: 0, y: 0 });

  // transitions per zone (including background audio pseudo-zone)
  const [zoneTransitions, setZoneTransitions] = useState<Record<string, ZoneTransition>>({
    z1: defaultTransition(),
    background_audio: defaultTransition(),
  });

  const layout = useMemo(() => {
    return ALL_LAYOUTS.find((l) => l.id === layoutId) ?? ALL_LAYOUTS[0];
  }, [layoutId]);

  const zones = useMemo(() => {
    // ScreenCloud shows "Background Audio" as a special item
    const base = layout.zones.map((z) => ({ ...z }));
    return [
      ...base,
      { id: "background_audio", name: "Background Audio", x: 0, y: 0, w: 0, h: 0 },
    ];
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

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      // You can adjust this response shape to match your backend
      // Expected: { item: Channel }
      const r = await apiJson<{ item: Channel }>(`/api/channels/${id}`);
      const ch = r.item;
      setChannel(ch);

      // if backend returns width/height/layoutId, use them; else keep defaults
      setLayoutId(ch.layoutId || "layout_main");
      setWidth(ch.width || 1920);
      setHeight(ch.height || 1080);
    } catch (e: any) {
      setError(`Failed to load channel. ${e?.message ?? ""}`.trim());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cover = useMemo(() => {
    return coverFromId(id || "seed");
  }, [id]);

  const dimLabel = useMemo(() => `${width} × ${height}`, [width, height]);

  const activeTransition = zoneTransitions[activeZoneId] ?? defaultTransition();

  function updateActiveTransition(patch: Partial<ZoneTransition>) {
    setZoneTransitions((prev) => ({
      ...prev,
      [activeZoneId]: { ...(prev[activeZoneId] ?? defaultTransition()), ...patch },
    }));
  }

  return (
    <div className="ce">
      <div className="ce-topbar">
        <button className="ce-back" onClick={() => nav("/channels")} aria-label="Back">
          ←
        </button>

        <div className="ce-title">
          <div className="ce-cover" style={{ background: cover }} />
          <div className="ce-title-text">
            <div className="ce-name">{channel?.name ?? (loading ? "Loading…" : "Channel")}</div>
            <div className="ce-sub">
              {channel?.orientation ? (channel.orientation === "landscape" ? "Landscape" : "Portrait") : "—"}
            </div>
          </div>
        </div>

        <div className="ce-actions">
          <button className="btn btn-ghost" onClick={() => { /* later */ }}>
            Preview
          </button>
          <button className="btn btn-primary" onClick={() => { /* later */ }}>
            Publish
          </button>

          <div className="ce-more" ref={moreRef}>
            <button className="btn btn-ghost" aria-label="More" onClick={() => setMoreOpen((v) => !v)}>
              …
            </button>

            {moreOpen && (
              <div className="ce-menu">
                <button className="ce-menu-item" onClick={() => setMoreOpen(false)}>Duplicate</button>
                <button className="ce-menu-item danger" onClick={() => setMoreOpen(false)}>Delete</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="ce-alert">
          {error}
        </div>
      )}

      <div className="ce-grid">
        <div className="ce-main">
          <div className="ce-main-toolbar">
            <div className="ce-selects">
              <div className="ce-select">
                <select value={activeZoneId} onChange={(e) => setActiveZoneId(e.target.value)}>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ce-select">
                <select value={"fill"} onChange={() => { /* reserved (Fill Zone) */ }}>
                  <option value="fill">Fill Zone</option>
                </select>
              </div>
            </div>

            <button className="btn btn-ghost" onClick={() => { /* later */ }}>
              + Add Content
            </button>
          </div>

          <div className="ce-empty">
            <img className="ce-empty-img" src="/assets/icons/emptychannel.svg" alt="" />
            <div className="ce-empty-title">This channel is nothing without content</div>
            <div className="ce-empty-sub">
              Add your playlists or individual pieces of content and schedule them for something great.
            </div>
            <button className="btn btn-ghost" onClick={() => { /* later */ }}>
              Add Content
            </button>
          </div>
        </div>

        <div className="ce-side">
          <div className="ce-side-tabs">
            <button
              className={`ce-side-tab ${panelTab === "layout" ? "is-active" : ""}`}
              onClick={() => setPanelTab("layout")}
            >
              LAYOUT
            </button>
            <button
              className={`ce-side-tab ${panelTab === "settings" ? "is-active" : ""}`}
              onClick={() => setPanelTab("settings")}
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

                <button className="btn btn-ghost" onClick={() => setDimModalOpen(true)}>
                  Change
                </button>
              </div>

              <div className="ce-layout-preview">
                <div
                  className="ce-layout-thumb-wrap"
                  onMouseLeave={() => setHover({ txt: null, x: 0, y: 0 })}
                >
                  <LayoutThumb
                    layout={layout}
                    width={width}
                    height={height}
                    onHover={(txt, x, y) => setHover({ txt, x, y })}
                  />
                </div>

                <button className="btn btn-ghost" onClick={() => setLayoutModalOpen(true)}>
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
              </div>

              <div className="ce-tip">
                Tip: Hover zones in the preview to see pixel dimensions.
              </div>
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
                      onChange={(e) => updateActiveTransition({ type: e.target.value as TransitionType })}
                      disabled={!activeTransition.enabled}
                    >
                      <option value="fade">fade</option>
                      <option value="slide-left">slide-left</option>
                      <option value="slide-right">slide-right</option>
                      <option value="slide-up">slide-up</option>
                      <option value="slide-down">slide-down</option>
                      <option value="zoom">zoom</option>
                      <option value="none">none</option>
                    </select>
                  </label>

                  <div className="ce-two">
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

                    <label className="ce-field">
                      <div className="ce-field-label">Color</div>
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
                  </div>
                </div>
              </div>

              <div className="ce-tip">
                Next step: apply these transition settings when rendering zone content playback.
              </div>
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
          // placeholder; later opens layout designer
          setLayoutModalOpen(false);
        }}
      />

      <DimensionModal
        open={dimModalOpen}
        current={{ w: width, h: height }}
        onClose={() => setDimModalOpen(false)}
        onPick={(w, h) => {
          setWidth(w);
          setHeight(h);
          setDimModalOpen(false);
        }}
      />
    </div>
  );
}

