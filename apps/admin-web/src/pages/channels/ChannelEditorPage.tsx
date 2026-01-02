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
  // percentage based rect
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

/** Exactly 29 layouts (no duplicates). */
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
    id: "layout_ticker",
    name: "Main + Tickertape",
    zones: [
      { id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 84 },
      { id: "z2", name: "Tickertape", x: 0, y: 84, w: 100, h: 16 },
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
    name: "Left Bar + Main + Footer",
    zones: [
      { id: "z1", name: "Left Bar", x: 0, y: 0, w: 24, h: 78 },
      { id: "z2", name: "Main Zone", x: 24, y: 0, w: 76, h: 78 },
      { id: "z3", name: "Footer", x: 0, y: 78, w: 100, h: 22 },
    ],
  },
  {
    id: "layout_main_right_footer",
    name: "Main + Right Bar + Footer",
    zones: [
      { id: "z1", name: "Main Zone", x: 0, y: 0, w: 76, h: 78 },
      { id: "z2", name: "Right Bar", x: 76, y: 0, w: 24, h: 78 },
      { id: "z3", name: "Footer", x: 0, y: 78, w: 100, h: 22 },
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
    id: "layout_picture_in_picture",
    name: "Picture-in-Picture",
    zones: [
      { id: "z1", name: "Main Zone", x: 0, y: 0, w: 100, h: 100 },
      { id: "z2", name: "Widget", x: 72, y: 8, w: 24, h: 24 },
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
    id: "layout_video_frame",
    name: "Video Frame",
    zones: [
      { id: "z1", name: "Main Zone", x: 8, y: 10, w: 84, h: 80 },
      { id: "z2", name: "Frame", x: 0, y: 0, w: 100, h: 100 },
    ],
  },
  {
    id: "layout_side_stack",
    name: "Main + Side Stack",
    zones: [
      { id: "z1", name: "Main Zone", x: 0, y: 0, w: 72, h: 100 },
      { id: "z2", name: "Side Top", x: 72, y: 0, w: 28, h: 50 },
      { id: "z3", name: "Side Bottom", x: 72, y: 50, w: 28, h: 50 },
    ],
  },
  {
    id: "layout_footer_split",
    name: "Split + Footer",
    zones: [
      { id: "z1", name: "Left", x: 0, y: 0, w: 50, h: 82 },
      { id: "z2", name: "Right", x: 50, y: 0, w: 50, h: 82 },
      { id: "z3", name: "Footer", x: 0, y: 82, w: 100, h: 18 },
    ],
  },
  {
    id: "layout_header_main",
    name: "Header + Main",
    zones: [
      { id: "z1", name: "Header", x: 0, y: 0, w: 100, h: 20 },
      { id: "z2", name: "Main Zone", x: 0, y: 20, w: 100, h: 80 },
    ],
  },
  {
    id: "layout_main_footer_right",
    name: "Main + Footer + Right Bar",
    zones: [
      { id: "z1", name: "Main Zone", x: 0, y: 0, w: 76, h: 80 },
      { id: "z2", name: "Right Bar", x: 76, y: 0, w: 24, h: 80 },
      { id: "z3", name: "Footer", x: 0, y: 80, w: 100, h: 20 },
    ],
  },
  {
    id: "layout_main_footer_left",
    name: "Left Bar + Main + Footer (Alt)",
    zones: [
      { id: "z1", name: "Left Bar", x: 0, y: 0, w: 24, h: 80 },
      { id: "z2", name: "Main Zone", x: 24, y: 0, w: 76, h: 80 },
      { id: "z3", name: "Footer", x: 0, y: 80, w: 100, h: 20 },
    ],
  },
  {
    id: "layout_two_top_one_bottom",
    name: "Two Top + One Bottom",
    zones: [
      { id: "z1", name: "Top Left", x: 0, y: 0, w: 50, h: 50 },
      { id: "z2", name: "Top Right", x: 50, y: 0, w: 50, h: 50 },
      { id: "z3", name: "Bottom", x: 0, y: 50, w: 100, h: 50 },
    ],
  },
  {
    id: "layout_one_top_two_bottom",
    name: "One Top + Two Bottom",
    zones: [
      { id: "z1", name: "Top", x: 0, y: 0, w: 100, h: 50 },
      { id: "z2", name: "Bottom Left", x: 0, y: 50, w: 50, h: 50 },
      { id: "z3", name: "Bottom Right", x: 50, y: 50, w: 50, h: 50 },
    ],
  },
  {
    id: "layout_center_spotlight",
    name: "Center Spotlight",
    zones: [
      { id: "z1", name: "Background", x: 0, y: 0, w: 100, h: 100 },
      { id: "z2", name: "Spotlight", x: 25, y: 20, w: 50, h: 60 },
    ],
  },
];

function useOutsideClick<T extends HTMLElement>(ref: React.RefObject<T | null>, onOutside: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ref, onOutside, enabled]);
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(txt || `${res.status} ${res.statusText}`);
  return (txt ? JSON.parse(txt) : null) as T;
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
    <div className="clm-thumb">
      {layout.zones.map((z, idx) => (
        <div
          key={z.id}
          className="clm-zone"
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
            onHover(`w:${pxW}  h:${pxH}`, rect.left + rect.width / 2, rect.top - 8);
          }}
          onMouseLeave={() => onHover(null, 0, 0)}
        >
          <div className="clm-zone-badge">{idx + 1}</div>
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
}: {
  open: boolean;
  layouts: LayoutDef[];
  currentLayoutId: string;
  width: number;
  height: number;
  onClose: () => void;
  onSelect: (layoutId: string) => void;
}) {
  const [tab, setTab] = useState<"all" | "custom">("all");
  const [hover, setHover] = useState<{ txt: string | null; x: number; y: number }>({ txt: null, x: 0, y: 0 });

  if (!open) return null;

  return (
    <div className="ce-modal-backdrop" role="dialog" aria-modal="true">
      <div className="ce-modal ce-modal-lg">
        <div className="ce-modal-header">
          <div className="ce-modal-title">Choose Layout</div>
          <button className="ce-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="ce-modal-tabs">
          <button className={`ce-tab ${tab === "all" ? "is-active" : ""}`} onClick={() => setTab("all")}>
            ALL LAYOUTS
          </button>
          <button className={`ce-tab ${tab === "custom" ? "is-active" : ""}`} onClick={() => setTab("custom")}>
            CUSTOM LAYOUTS
          </button>
        </div>

        <div className="ce-modal-body">
          <div className="ce-modal-toolbar">
            <button className="btn btn-ghost" type="button">
              Customize
            </button>
          </div>

          <div className="clm-grid">
            {(tab === "all" ? layouts : []).map((l) => {
              const selected = l.id === currentLayoutId;
              return (
                <button
                  key={l.id}
                  type="button"
                  className={`clm-card ${selected ? "is-selected" : ""}`}
                  onClick={() => onSelect(l.id)}
                >
                  <LayoutThumb layout={l} width={width} height={height} onHover={(txt, x, y) => setHover({ txt, x, y })} />
                  <div className="clm-name">{l.name}</div>
                </button>
              );
            })}
          </div>

          {hover.txt && (
            <div className="clm-tooltip" style={{ left: hover.x, top: hover.y }}>
              {hover.txt}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChooseDimensionModal({
  open,
  width,
  height,
  onClose,
  onApply,
}: {
  open: boolean;
  width: number;
  height: number;
  onClose: () => void;
  onApply: (w: number, h: number) => void;
}) {
  const [cw, setCw] = useState<number>(width);
  const [ch, setCh] = useState<number>(height);

  useEffect(() => {
    if (open) {
      setCw(width);
      setCh(height);
    }
  }, [open, width, height]);

  if (!open) return null;

  return (
    <div className="ce-modal-backdrop" role="dialog" aria-modal="true">
      <div className="ce-modal">
        <div className="ce-modal-header">
          <div className="ce-modal-title">Choose Dimension</div>
          <button className="ce-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="ce-modal-body">
          <div className="dim-grid">
            {DIM_PRESETS.map((p) => (
              <button key={p.label} className="dim-item" type="button" onClick={() => onApply(p.w, p.h)}>
                <div className="dim-item-title">{p.label}</div>
              </button>
            ))}
          </div>

          <div className="dim-custom">
            <div className="dim-custom-title">Custom</div>
            <div className="dim-custom-row">
              <input type="number" value={cw} onChange={(e) => setCw(Number(e.target.value || 0))} />
              <span className="dim-x">×</span>
              <input type="number" value={ch} onChange={(e) => setCh(Number(e.target.value || 0))} />
              <button className="btn btn-primary" type="button" onClick={() => onApply(cw, ch)}>
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChannelEditorPage() {
  const nav = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [channel, setChannel] = useState<Channel | null>(null);

  const [sideTab, setSideTab] = useState<"layout" | "settings">("layout");

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  useOutsideClick(moreRef, () => setMoreOpen(false), moreOpen);

  const [chooseLayoutOpen, setChooseLayoutOpen] = useState(false);
  const [chooseDimOpen, setChooseDimOpen] = useState(false);

  const currentLayout = useMemo(() => {
    const fallback = ALL_LAYOUTS[0];
    const layoutId = channel?.layoutId || fallback.id;
    return ALL_LAYOUTS.find((l) => l.id === layoutId) || fallback;
  }, [channel]);

  const [selectedZoneId, setSelectedZoneId] = useState<string>(() => currentLayout.zones[0]?.id || "z1");

  // keep zone selection valid when layout changes
  useEffect(() => {
    const zones = currentLayout.zones;
    if (!zones.some((z) => z.id === selectedZoneId)) {
      setSelectedZoneId(zones[0]?.id || "z1");
    }
  }, [currentLayout, selectedZoneId]);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const r = await apiJson<{ item: Channel }>(`/api/channels/${id}`);
      setChannel(r.item);
    } catch (e: any) {
      // Keep page usable even when API is not ready
      setError(`Channel API is not reachable (GET /api/channels/${id} failed). ${e?.message ?? ""}`.trim());
      setChannel({
        id,
        name: "Channel",
        orientation: "landscape",
        createdAt: new Date().toISOString(),
        width: 1920,
        height: 1080,
        layoutId: "layout_right_bar",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function applyDimension(w: number, h: number) {
    setChooseDimOpen(false);
    setChannel((prev) => (prev ? { ...prev, width: w, height: h } : prev));
    if (!id) return;
    try {
      await apiJson(`/api/channels/${id}`, { method: "PATCH", body: JSON.stringify({ width: w, height: h }) });
    } catch {
      // ignore (UI-first)
    }
  }

  async function applyLayout(layoutId: string) {
    setChooseLayoutOpen(false);
    setChannel((prev) => (prev ? { ...prev, layoutId } : prev));
    if (!id) return;
    try {
      await apiJson(`/api/channels/${id}`, { method: "PATCH", body: JSON.stringify({ layoutId }) });
    } catch {
      // ignore (UI-first)
    }
  }

  async function deleteChannel() {
    if (!id) return;
    setMoreOpen(false);
    try {
      await apiJson(`/api/channels/${id}`, { method: "DELETE" });
    } catch {
      // ignore
    } finally {
      nav("/channels");
    }
  }

  const dimLabel = channel ? `${channel.width} × ${channel.height}` : "—";

  return (
    <div className="ce">
      <div className="ce-topbar">
        <button className="ce-back" onClick={() => nav("/channels")} aria-label="Back">
          ←
        </button>

        <div className="ce-title">
          <div className="ce-name">{channel?.name ?? "Channel"}</div>
        </div>

        <div className="ce-actions">
          <button className="btn btn-ghost" type="button">
            Preview
          </button>
          <button className="btn btn-primary" type="button">
            Publish
          </button>

          <div className="ce-more" ref={moreRef}>
            <button className="ce-more-btn" onClick={() => setMoreOpen((v) => !v)} aria-label="More">
              …
            </button>
            {moreOpen && (
              <div className="ce-menu" role="menu">
                <button className="ce-menu-item danger" onClick={deleteChannel}>
                  Delete channel
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
            <div className="ce-zone-select">
              <select value={selectedZoneId} onChange={(e) => setSelectedZoneId(e.target.value)}>
                {currentLayout.zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>

            <button className="btn btn-ghost" type="button">
              Add Content
            </button>
          </div>

          <div className="ce-empty">
            <img className="ce-empty-img" src="/assets/icons/emptychannel.svg" alt="" />
            <div className="ce-empty-title">This channel is nothing without content</div>
            <div className="ce-empty-sub">
              Add your playlists or individual pieces of content and schedule them for something great.
            </div>
            <button className="btn btn-ghost" type="button">
              Add Content
            </button>
          </div>
        </div>

        <div className="ce-side">
          <div className="ce-side-tabs">
            <button
              className={`ce-side-tab ${sideTab === "layout" ? "is-active" : ""}`}
              onClick={() => setSideTab("layout")}
              type="button"
            >
              LAYOUT
            </button>
            <button
              className={`ce-side-tab ${sideTab === "settings" ? "is-active" : ""}`}
              onClick={() => setSideTab("settings")}
              type="button"
            >
              SETTINGS
            </button>
          </div>

          {sideTab === "layout" ? (
            <div className="ce-side-section">
              <div className="ce-side-row">
                <div>
                  <div className="ce-dim-label">Dimension</div>
                  <div className="ce-dim-value">{dimLabel}</div>
                </div>

                <button className="btn btn-ghost" type="button" onClick={() => setChooseDimOpen(true)}>
                  Change
                </button>
              </div>

              <div className="ce-layout-preview">
                <div className="ce-layout-thumb">
                  <div className="layout-mini">
                    {currentLayout.zones.map((z, idx) => (
                      <div
                        key={z.id}
                        className="zone"
                        style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
                        title={`${idx + 1}`}
                      />
                    ))}
                  </div>
                </div>

                <button className="btn btn-ghost" type="button" onClick={() => setChooseLayoutOpen(true)}>
                  Edit Layout
                </button>
              </div>

              <div className="ce-zone-title">ZONE</div>
              <div className="ce-zone-pill">
                <div className="ce-zone-num">{currentLayout.zones.findIndex((z) => z.id === selectedZoneId) + 1}</div>
                <div>{currentLayout.zones.find((z) => z.id === selectedZoneId)?.name ?? "Zone"}</div>
              </div>

              <div className="ce-transition">
                <div className="ce-transition-title">Enable Transition</div>
                <div className="ce-switch" aria-hidden="true" />
              </div>

              <div className="ce-tip" style={{ marginTop: 10 }}>
                Tip: Your channel was created successfully. If you still see 404 here, implement GET /api/channels/:id in
                the API.
              </div>
            </div>
          ) : (
            <div className="ce-side-section">
              <div className="ce-tip">Settings panel (placeholder)</div>
            </div>
          )}
        </div>
      </div>

      <ChooseLayoutModal
        open={chooseLayoutOpen}
        layouts={ALL_LAYOUTS}
        currentLayoutId={channel?.layoutId || "layout_main"}
        width={channel?.width || 1920}
        height={channel?.height || 1080}
        onClose={() => setChooseLayoutOpen(false)}
        onSelect={(layoutId) => applyLayout(layoutId)}
      />

      <ChooseDimensionModal
        open={chooseDimOpen}
        width={channel?.width || 1920}
        height={channel?.height || 1080}
        onClose={() => setChooseDimOpen(false)}
        onApply={(w, h) => applyDimension(w, h)}
      />

      {loading && <div className="ce-loading">Loading…</div>}
    </div>
  );
}

