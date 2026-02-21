// ChannelContentPickerModal.tsx
import React, { useEffect, useMemo, useState } from "react";
import "./ChannelContentPickerModal.css";
import { X, Search, CheckCircle2, Circle, Folder, ChevronRight } from "lucide-react";

/* ---------------- Types ---------------- */

export type MediaItem = {
  id: string;
  url: string;
  type?: "image" | "video";
  name?: string;
  createdAt?: string;
  folder?: string; // UI-only (kept for backward compatibility / fallback)
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

type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  children: FolderNode[];
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
  if (/\.(mp4|webm|mov|mkv|avi|m4v)$/.test(n)) return "video";
  return "image";
}

function normalizeMediaPayload(data: any): { items: any[]; folders: any[] } {
  const root = data ?? {};

  const items =
    Array.isArray(root?.items) ? root.items :
    Array.isArray(root?.items?.items) ? root.items.items :
    Array.isArray(root?.data?.items) ? root.data.items :
    [];

  const folders =
    Array.isArray(root?.folders) ? root.folders :
    Array.isArray(root?.items?.folders) ? root.items.folders :
    Array.isArray(root?.data?.folders) ? root.data.folders :
    [];

  return { items, folders };
}

/**
 * Kept: UI-only folder inference (fallback if folders API is missing)
 */
function inferFolder(raw: any): string {
  const fromField =
    (typeof raw?.folder === "string" && raw.folder) ||
    (typeof raw?.directory === "string" && raw.directory) ||
    (typeof raw?.path === "string" && raw.path);

  if (fromField) return String(fromField).trim();

  const url: string = String(raw?.url || "");
  if (!url) return "";

  // common patterns
  const m = url.match(/\/(?:uploads|media|files)\/([^\/?#]+)\//i);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]).trim();
    } catch {
      return m[1].trim();
    }
  }

  // fallback: take parent folder from pathname (best-effort)
  try {
    const u = new URL(url, window.location.origin);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      parts.pop(); // remove filename
      const candidate = parts[parts.length - 1] || "";
      if (!candidate) return "";
      if (/^(uploads|media|files|static|public|assets)$/i.test(candidate)) return "";
      return decodeURIComponent(candidate).trim();
    }
  } catch {
    // ignore
  }

  return "";
}

function buildFolderIndex(nodes: FolderNode[]) {
  const byId = new Map<string, FolderNode>();
  const parentToChildren = new Map<string | null, FolderNode[]>();

  function walk(list: FolderNode[], parentId: string | null) {
    parentToChildren.set(parentId, list || []);
    for (const n of list || []) {
      byId.set(n.id, n);
      walk(n.children || [], n.id);
    }
  }

  walk(nodes || [], null);
  return { byId, parentToChildren, roots: parentToChildren.get(null) || [] };
}

/* ---------------- Component ---------------- */

export default function ChannelContentPickerModal({ open, onClose, onConfirm }: Props) {
  const [tab, setTab] = useState<TabKey>("media");
  const [q, setQ] = useState("");

  const [media, setMedia] = useState<MediaItem[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Folder API state
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [folderMode, setFolderMode] = useState<"all" | "folder">("all");
  const [folderId, setFolderId] = useState<string | null>(null); // null => Library/root

  /* ---------- lifecycle ---------- */

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    setSelected(new Set());
    setQ("");

    if (tab === "media") {
      setFolderMode("all");
      setFolderId(null);
      loadFolders();
      loadMedia();
    }

    if (tab === "playlists") {
      loadPlaylists();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  // Debounced reload for media when search/folder changes
  useEffect(() => {
    if (!open) return;
    if (tab !== "media") return;
    const t = window.setTimeout(() => loadMedia(), 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, q, folderId, folderMode]);

  /* ---------- loaders ---------- */

  async function loadFolders() {
    try {
      const r: any = await fetchJson<any>("/api/media/folders");
      const items = Array.isArray(r) ? r : Array.isArray(r?.items) ? r.items : [];
      setFolders(items);
    } catch {
      setFolders([]);
    }
  }

 async function loadMedia() {
  setLoading(true);
  try {
    const params = new URLSearchParams();
    const qq = q.trim();

    if (qq) params.set("search", qq);

    // includeFolders helps keep the backend path consistent
    params.set("includeFolders", "true");

    // Apply folder filtering only when user explicitly selected folder mode AND not searching
    if (!qq && folderMode === "folder") {
      params.set("folderId", folderId ? folderId : "root");
    }

    const url = params.toString() ? `/api/media?${params.toString()}` : "/api/media";
    const r = await fetchJson<any>(url);

    const { items } = normalizeMediaPayload(r);

    setMedia(
      items.map((m: any) => {
        const name = m.name || nameFromUrl(m.url);
        return {
          id: String(m.id ?? m._id),
          url: m.url,
          name,
          type: guessType(name || m.url),
          createdAt: m.createdAt,
          folder: inferFolder(m), // fallback only
        };
      })
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
    } catch {
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

  /* ---------- filtering (client-side when searching only) ---------- */

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

  const folderIndex = useMemo(() => buildFolderIndex(folders), [folders]);
  const rootFolders = folderIndex.roots || [];

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

            {/* SCROLLABLE CONTENT (between toolbar and footer) */}
            <div className="ccp-content">
              {/* MEDIA TAB: folders left + list right */}
              {tab === "media" && (
                <div className="ccp-media-grid">
                  {/* FOLDERS */}
                  <div className="ccp-folders">
                    <div className="ccp-section-title">Folders</div>

                    <div className="ccp-folder-list">
                      {/* All */}
                      <button
                        type="button"
                        className={`ccp-folder-row ${folderMode === "all" ? "is-active" : ""}`}
                        onClick={() => {
                          setFolderMode("all");
                          setFolderId(null);
                        }}
                        title="Show all media"
                      >
                        <span className="ccp-folder-caret" aria-hidden>
                          <ChevronRight size={14} />
                        </span>
                        <Folder size={16} />
                        <span className="ccp-folder-name">All</span>
                      </button>

                      {/* Library (root) */}
                      <button
                        type="button"
                        className={`ccp-folder-row ${
                          folderMode === "folder" && folderId === null ? "is-active" : ""
                        }`}
                        onClick={() => {
                          setFolderMode("folder");
                          setFolderId(null);
                        }}
                        title="Library (root)"
                      >
                        <span className="ccp-folder-caret" aria-hidden>
                          <ChevronRight size={14} />
                        </span>
                        <Folder size={16} />
                        <span className="ccp-folder-name">Library</span>
                      </button>

                      {/* Real folders from /api/media/folders */}
                      {rootFolders.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={`ccp-folder-row ${
                            folderMode === "folder" && folderId === f.id ? "is-active" : ""
                          }`}
                          onClick={() => {
                            setFolderMode("folder");
                            setFolderId(f.id);
                          }}
                          title={f.name}
                        >
                          <span className="ccp-folder-caret" aria-hidden>
                            <ChevronRight size={14} />
                          </span>
                          <Folder size={16} />
                          <span className="ccp-folder-name">{f.name}</span>
                        </button>
                      ))}

                      {!loading && rootFolders.length === 0 && (
                        <div className="ccp-empty ccp-empty-folders">No folders.</div>
                      )}
                    </div>
                  </div>

                  {/* LIST */}
                  <div className="ccp-list">
                    {loading && <div className="ccp-empty">Loading…</div>}

                    {!loading && filteredMedia.length === 0 && (
                      <div className="ccp-empty">No media found.</div>
                    )}

                    {!loading &&
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
                              <div className="ccp-row-text">
                                <div className="ccp-name">{m.name}</div>
                                {m.createdAt ? (
                                  <div className="ccp-meta">
                                    Uploaded {new Date(m.createdAt).toLocaleString()}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div className="ccp-kind">{m.type}</div>
                            <div className="ccp-sel">
                              {sel ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* PLAYLISTS TAB */}
              {tab === "playlists" && (
                <div className="ccp-list">
                  {loading && <div className="ccp-empty">Loading…</div>}

                  {!loading && filteredPlaylists.length === 0 && (
                    <div className="ccp-empty">No playlists found.</div>
                  )}

                  {!loading &&
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
                            <div className="ccp-row-text">
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
              )}
            </div>

            {/* FOOTER (pinned) */}
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
