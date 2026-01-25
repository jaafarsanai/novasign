import React, { useEffect, useMemo, useState } from "react";
import "./ChannelContentPickerModal.css";
import { X, Search, CheckCircle2, Circle, Folder } from "lucide-react";

/* ---------------- Types ---------------- */

export type MediaItem = {
  id: string;
  url: string;
  type?: "image" | "video";
  name?: string;
  createdAt?: string;
};

export type PlaylistItem = {
  id: string;
  name: string;
  updatedAt?: string;
};

export type PickerResult =
  | { type: "media"; item: MediaItem }
  | { type: "playlist"; item: PlaylistItem };

type TabKey = "media" | "playlists" | "links";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (items: PickerResult[]) => void;
};

/* ---------------- Helpers ---------------- */

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function nameFromUrl(url?: string) {
  if (!url) return "";
  try {
    return decodeURIComponent(url.split("?")[0].split("/").pop() || "");
  } catch {
    return url;
  }
}

function guessType(name?: string): "image" | "video" {
  const n = (name || "").toLowerCase();
  if (/\.(mp4|webm|mov|mkv)$/.test(n)) return "video";
  return "image";
}

/* ---------------- Component ---------------- */

export default function ChannelContentPickerModal({
  open,
  onClose,
  onConfirm,
}: Props) {
  const [tab, setTab] = useState<TabKey>("media");
  const [q, setQ] = useState("");

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  /* ---------- lifecycle ---------- */

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    setSelected(new Set());
    setQ("");

    if (tab === "media") loadMedia();
    if (tab === "playlists") loadPlaylists();
  }, [open, tab]);

  /* ---------- loaders ---------- */

  async function loadMedia() {
    setLoading(true);
    try {
      const r = await fetchJson<{ items: any[] }>("/api/media");
      setMedia(
        (r.items || []).map((m) => ({
          id: m.id,
          url: m.url,
          name: m.name || nameFromUrl(m.url),
          type: guessType(m.name || m.url),
          createdAt: m.createdAt,
        }))
      );
    } catch {
      setMedia([]);
    } finally {
      setLoading(false);
    }
  }

 async function loadPlaylists() {
  setLoading(true);
  try {
    const r: any = await fetchJson<any>("/api/playlists");

    // Normalize response shape
    const list =
      Array.isArray(r) ? r :
      Array.isArray(r.items) ? r.items :
      Array.isArray(r.playlists) ? r.playlists :
      Array.isArray(r.data) ? r.data :
      [];

    setPlaylists(
      list.map((p: any) => ({
        id: String(p.id ?? p._id),
        name: p.name ?? p.title ?? "Untitled playlist",
        updatedAt: p.updatedAt ?? p.updated_at,
      }))
    );
  } catch (e) {
    console.error("Failed to load playlists", e);
    setPlaylists([]);
  } finally {
    setLoading(false);
  }
}

  /* ---------- selection ---------- */

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function confirm() {
    const results: PickerResult[] = [];

    for (const id of selected) {
      const m = media.find((x) => x.id === id);
      if (m) results.push({ type: "media", item: m });

      const p = playlists.find((x) => x.id === id);
      if (p) results.push({ type: "playlist", item: p });
    }

    onConfirm(results);
    onClose();
  }

  /* ---------- filtering ---------- */

  const filteredMedia = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return media;
    return media.filter((m) => (m.name || "").toLowerCase().includes(qq));
  }, [media, q]);

  const filteredPlaylists = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return playlists;
    return playlists.filter((p) => p.name.toLowerCase().includes(qq));
  }, [playlists, q]);

  if (!open) return null;

  /* ---------------- render ---------------- */

  return (
    <div className="ccp-backdrop" onMouseDown={onClose}>
      <div className="ccp-modal" onMouseDown={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="ccp-header">
          <div className="ccp-title">Media Picker</div>
          <button className="ccp-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="ccp-body">
          {/* SIDEBAR */}
          <aside className="ccp-nav">
            <button
              className={`ccp-nav-item ${tab === "media" ? "is-active" : ""}`}
              onClick={() => setTab("media")}
            >
              📁 Media
            </button>

            <button
              className={`ccp-nav-item ${tab === "playlists" ? "is-active" : ""}`}
              onClick={() => setTab("playlists")}
            >
              ▶ Playlists
            </button>

            <button className="ccp-nav-item" disabled>
              🔗 Links
            </button>
          </aside>

          {/* MAIN */}
          <main className="ccp-main">
            <div className="ccp-toolbar">
              <Search size={16} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${tab}`}
              />
            </div>

            <div className="ccp-list">
              {loading && <div className="ccp-empty">Loading…</div>}

              {!loading && tab === "media" && filteredMedia.length === 0 && (
                <div className="ccp-empty">No media found.</div>
              )}

              {!loading &&
                tab === "media" &&
                filteredMedia.map((m) => {
                  const sel = selected.has(m.id);
                  return (
                    <div
                      key={m.id}
                      className={`ccp-row ${sel ? "is-selected" : ""}`}
                      onClick={() => toggle(m.id)}
                    >
                      <div className="ccp-row-left">
                        <div className="ccp-thumb">
                          {m.type === "video" ? (
                            <video src={m.url} muted />
                          ) : (
                            <img src={m.url} alt="" />
                          )}
                        </div>
                        <div>
                          <div className="ccp-name">{m.name}</div>
                          {m.createdAt && (
                            <div className="ccp-meta">
                              Uploaded {new Date(m.createdAt).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="ccp-kind">{m.type}</div>
                      <div className="ccp-sel">
                        {sel ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </div>
                    </div>
                  );
                })}

              {!loading &&
                tab === "playlists" &&
                filteredPlaylists.map((p) => {
                  const sel = selected.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`ccp-row ${sel ? "is-selected" : ""}`}
                      onClick={() => toggle(p.id)}
                    >
                      <div className="ccp-row-left">
                        <div className="ccp-thumb ccp-thumb-folder">
                          <Folder size={18} />
                        </div>
                        <div>
                          <div className="ccp-name">{p.name}</div>
                          <div className="ccp-meta">Playlist</div>
                        </div>
                      </div>
                      <div className="ccp-kind">playlist</div>
                      <div className="ccp-sel">
                        {sel ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* FOOTER */}
            <div className="ccp-footer">
              <span className="ccp-selected">
                Selected <b>{selected.size}</b>
              </span>
              <div className="ccp-actions">
                <button className="ccp-btn" onClick={() => setSelected(new Set())}>
                  Deselect All
                </button>
                <button
                  className="ccp-btn ccp-btn-yellow"
                  disabled={selected.size === 0}
                  onClick={confirm}
                >
                  Add
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
