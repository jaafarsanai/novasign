import React, { useEffect, useMemo, useState } from "react";
import "./ScreenSetContentModal.css";
import {
  X,
  Search,
  CheckCircle2,
  Circle,
  Folder,
  Tv,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const ROOT_FOLDER_ID = "root";

/* ---------------- Types ---------------- */

export type ScreenChannelItem = {
  id: string;
  name: string;
  layoutId?: string;
  updatedAt?: string;
  orientation?: "landscape" | "portrait";
};

export type ScreenPlaylistItem = {
  id: string;
  name: string;
  updatedAt?: string;
};

type ScreenFolderItem = { id: string; name: string; parentId: string | null };

type ScreenMediaItem = {
  id: string;
  name: string | null;
  url: string | null;
  type: string | null;
  thumbnailUrl?: string | null;
  createdAt?: string | null;
};

export type ScreenPickerResult =
  | { type: "channel"; item: ScreenChannelItem }
  | { type: "playlist"; item: ScreenPlaylistItem }
  | { type: "media"; item: ScreenMediaItem };

type TabKey = "channels" | "playlists" | "media";

type ScreenOrientation4 =
  | "LANDSCAPE"
  | "LANDSCAPE_FLIPPED"
  | "PORTRAIT"
  | "PORTRAIT_FLIPPED";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (picked: ScreenPickerResult) => void;

  /** Used to filter channels only (playlists/media are not filtered) */
  screenOrientation?: ScreenOrientation4;
};

/* ---------------- Helpers ---------------- */

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text().catch(() => `${res.status}`));
  return res.json();
}

function normalizeList(r: any): any[] {
  return Array.isArray(r)
    ? r
    : Array.isArray(r?.items)
      ? r.items
      : Array.isArray(r?.data)
        ? r.data
        : Array.isArray(r?.folders)
          ? r.folders
          : Array.isArray(r?.media)
            ? r.media
            : [];
}

function screenBaseOrientation(o?: ScreenOrientation4): "landscape" | "portrait" {
  const s = String(o ?? "LANDSCAPE").toUpperCase();
  return s.startsWith("PORTRAIT") ? "portrait" : "landscape";
}

function normalizeChannelOrientation(raw: any): "landscape" | "portrait" | null {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s === "landscape" || s === "portrait") return s;
  return null;
}

/* ---------------- Component ---------------- */

export default function ScreenSetContentModal({
  open,
  onClose,
  onConfirm,
  screenOrientation,
}: Props) {
  const [tab, setTab] = useState<TabKey>("channels");
  const [q, setQ] = useState("");

  const [channels, setChannels] = useState<ScreenChannelItem[]>([]);
  const [playlists, setPlaylists] = useState<ScreenPlaylistItem[]>([]);

  // media browsing state
  const [folders, setFolders] = useState<ScreenFolderItem[]>([]);
  const [media, setMedia] = useState<ScreenMediaItem[]>([]);
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([
    { id: ROOT_FOLDER_ID, name: "All" },
  ]);

  const [loading, setLoading] = useState(false);

  // single selection
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // close on esc, lock scroll
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

  function select(t: ScreenPickerResult["type"], id: string) {
    setSelectedKey(`${t}:${id}`);
  }

  const picked: ScreenPickerResult | null = useMemo(() => {
    if (!selectedKey) return null;
    const [t, id] = selectedKey.split(":");

    if (t === "channel") {
      const it = channels.find((x) => x.id === id);
      return it ? { type: "channel", item: it } : null;
    }
    if (t === "playlist") {
      const it = playlists.find((x) => x.id === id);
      return it ? { type: "playlist", item: it } : null;
    }
    if (t === "media") {
      const it = media.find((x) => x.id === id);
      return it ? { type: "media", item: it } : null;
    }
    return null;
  }, [selectedKey, channels, playlists, media]);

  function confirm() {
    if (!picked) return;
    onConfirm(picked);
    onClose();
  }

  // -------- media loader --------

  async function loadMediaFolder(folderId: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("folderId", folderId || ROOT_FOLDER_ID);
      params.set("includeFolders", "true");
      if (q?.trim()) params.set("search", q.trim());

      const data: any = await fetchJson(`/api/media?${params.toString()}`);

      const itemsArr = Array.isArray(data.items)
        ? data.items
        : Array.isArray(data.items?.items)
          ? data.items.items
          : [];

      const foldersArr = Array.isArray(data.folders)
        ? data.folders
        : Array.isArray(data.items?.folders)
          ? data.items.folders
          : [];

      setMedia(itemsArr);
      setFolders(foldersArr);
    } catch {
      setMedia([]);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }

  function goIntoFolder(f: ScreenFolderItem) {
    setFolderStack((prev) => [...prev, { id: f.id, name: f.name }]);
  }

  function goBackFolder() {
    setFolderStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }

  function jumpToCrumb(idx: number) {
    setFolderStack((prev) => prev.slice(0, idx + 1));
  }

  // reload on open/tab change
  useEffect(() => {
    if (!open) return;

    setSelectedKey(null);
    setQ("");

    const run = async () => {
      setLoading(true);
      try {
        if (tab === "channels") {
          const r: any = await fetchJson<any>("/api/channels");
          const list = normalizeList(r);
          setChannels(
            list.map((c: any) => ({
              id: String(c.id ?? c._id),
              name: c.name ?? c.title ?? "Untitled channel",
              layoutId: c.layoutId,
              updatedAt: c.updatedAt ?? c.updated_at,
              orientation: normalizeChannelOrientation(c.orientation) ?? undefined,
            }))
          );
        } else if (tab === "playlists") {
          const r: any = await fetchJson<any>("/api/playlists");
          const list = normalizeList(r);
          setPlaylists(
            list.map((p: any) => ({
              id: String(p.id ?? p._id),
              name: p.name ?? p.title ?? "Untitled playlist",
              updatedAt: p.updatedAt ?? p.updated_at,
            }))
          );
        } else if (tab === "media") {
          setFolderStack([{ id: ROOT_FOLDER_ID, name: "All" }]);
        }
      } catch {
        if (tab === "channels") setChannels([]);
        if (tab === "playlists") setPlaylists([]);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [open, tab]);

  // load media whenever current folder or search changes
  const currentFolderId = folderStack[folderStack.length - 1]?.id ?? ROOT_FOLDER_ID;

  useEffect(() => {
    if (!open) return;
    if (tab !== "media") return;
    void loadMediaFolder(currentFolderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, currentFolderId, q]);

  // -------- filters --------

  const baseScreenOri = screenBaseOrientation(screenOrientation);

  const filteredChannels = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = !qq ? channels : channels.filter((c) => (c.name || "").toLowerCase().includes(qq));

    // Keep channels with missing orientation (older API) to avoid hiding everything,
    // but filter when the field exists.
    list = list.filter((c) => !c.orientation || c.orientation === baseScreenOri);

    return list;
  }, [channels, q, baseScreenOri]);

  const filteredPlaylists = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return playlists;
    return playlists.filter((p) => (p.name || "").toLowerCase().includes(qq));
  }, [playlists, q]);

  const filteredFolders = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return folders;
    return folders.filter((f) => (f.name || "").toLowerCase().includes(qq));
  }, [folders, q]);

  const filteredMedia = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return media;
    return media.filter((m) => (m.name || "").toLowerCase().includes(qq));
  }, [media, q]);

  if (!open) return null;

  const channelsEmptyMsg =
    channels.length === 0
      ? "No channels found."
      : `No channels found for this screen orientation (${baseScreenOri}).`;

  return (
    <div className="scp-backdrop" onMouseDown={onClose}>
      <div className="scp-modal" onMouseDown={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div className="scp-header">
          <div className="scp-title">Set content</div>
          <button className="scp-close" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="scp-body">
          {/* SIDEBAR */}
          <aside className="scp-nav">
            <button
              className={`scp-nav-item ${tab === "channels" ? "is-active" : ""}`}
              onClick={() => setTab("channels")}
              type="button"
            >
              <Tv size={16} /> Channels
            </button>

            <button
              className={`scp-nav-item ${tab === "playlists" ? "is-active" : ""}`}
              onClick={() => setTab("playlists")}
              type="button"
            >
              <Folder size={16} /> Playlists
            </button>

            <button
              className={`scp-nav-item ${tab === "media" ? "is-active" : ""}`}
              onClick={() => setTab("media")}
              type="button"
            >
              📁 Media
            </button>
          </aside>

          {/* MAIN */}
          <main className="scp-main">
            <div className="scp-toolbar">
              <Search size={16} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={tab === "media" ? "Search folders & media" : `Search ${tab}`}
              />
            </div>

            {tab === "media" ? (
              <div className="scp-media-grid">
                {/* LEFT: FOLDERS */}
                <div className="scp-folders">
                  <div className="scp-folders-top">
                    <button
                      type="button"
                      className="scp-folder-back"
                      onClick={goBackFolder}
                      disabled={folderStack.length <= 1 || loading}
                      title="Back"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    <div className="scp-breadcrumbs">
                      {folderStack.map((c, idx) => (
                        <button
                          key={`${c.id}-${idx}`}
                          type="button"
                          className={`scp-crumb ${idx === folderStack.length - 1 ? "is-active" : ""}`}
                          onClick={() => jumpToCrumb(idx)}
                          disabled={loading}
                        >
                          {c.name || "Folder"}
                          {idx < folderStack.length - 1 ? <ChevronRight size={14} /> : null}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="scp-folders-label">Folders</div>

                  <div className="scp-folders-list">
                    {loading && <div className="scp-empty">Loading…</div>}

                    {!loading && filteredFolders.length === 0 && (
                      <div className="scp-empty">No folders found.</div>
                    )}

                    {!loading &&
                      filteredFolders.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className="scp-folder-row"
                          onClick={() => goIntoFolder(f)}
                        >
                          <div className="scp-folder-ico">
                            <Folder size={16} />
                          </div>
                          <div className="scp-folder-name">{f.name}</div>
                          <div className="scp-folder-kind">Folder</div>
                        </button>
                      ))}
                  </div>
                </div>

                {/* RIGHT: FILES */}
                <div className="scp-media-files">
                  <div className="scp-list">
                    {loading && <div className="scp-empty">Loading…</div>}

                    {!loading && filteredMedia.length === 0 && (
                      <div className="scp-empty">No media found.</div>
                    )}

                    {!loading &&
                      filteredMedia.map((m) => {
                        const key = `media:${m.id}`;
                        const sel = selectedKey === key;

                        const pathLabel =
                          folderStack.length > 1 ? folderStack.map((x) => x.name).join(" / ") : null;

                        return (
                          <div
                            key={m.id}
                            className={`scp-row ${sel ? "is-selected" : ""}`}
                            onClick={() => select("media", m.id)}
                          >
                            <div className="scp-row-left">
                              <div className="scp-thumb">
                                {m.type === "video" && m.url ? (
                                  <video src={m.url} muted />
                                ) : m.thumbnailUrl ? (
                                  <img src={m.thumbnailUrl} alt="" />
                                ) : m.url ? (
                                  <img src={m.url} alt="" />
                                ) : (
                                  <div className="scp-thumb-fallback">MEDIA</div>
                                )}
                              </div>

                              <div>
                                <div className="scp-name">{m.name ?? "Untitled media"}</div>
                                {pathLabel ? (
                                  <div className="scp-meta">{pathLabel}</div>
                                ) : m.createdAt ? (
                                  <div className="scp-meta">
                                    Uploaded {new Date(m.createdAt).toLocaleString()}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="scp-kind">{m.type ?? "media"}</div>
                            <div className="scp-sel">
                              {sel ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="scp-list">
                {loading && <div className="scp-empty">Loading…</div>}

                {!loading && tab === "channels" && filteredChannels.length === 0 && (
                  <div className="scp-empty">{channelsEmptyMsg}</div>
                )}

                {!loading && tab === "playlists" && filteredPlaylists.length === 0 && (
                  <div className="scp-empty">No playlists found.</div>
                )}

                {!loading &&
                  tab === "channels" &&
                  filteredChannels.map((c) => {
                    const key = `channel:${c.id}`;
                    const sel = selectedKey === key;
                    return (
                      <div
                        key={c.id}
                        className={`scp-row ${sel ? "is-selected" : ""}`}
                        onClick={() => select("channel", c.id)}
                      >
                        <div className="scp-row-left">
                          <div className="scp-thumb scp-thumb-channel">
                            <Tv size={18} />
                          </div>
                          <div>
                            <div className="scp-name">{c.name}</div>
                            <div className="scp-meta">
                              {c.layoutId ? `Layout: ${c.layoutId}` : "Channel"}
                              {c.orientation ? ` • ${c.orientation}` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="scp-kind">channel</div>
                        <div className="scp-sel">
                          {sel ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                        </div>
                      </div>
                    );
                  })}

                {!loading &&
                  tab === "playlists" &&
                  filteredPlaylists.map((p) => {
                    const key = `playlist:${p.id}`;
                    const sel = selectedKey === key;
                    return (
                      <div
                        key={p.id}
                        className={`scp-row ${sel ? "is-selected" : ""}`}
                        onClick={() => select("playlist", p.id)}
                      >
                        <div className="scp-row-left">
                          <div className="scp-thumb scp-thumb-folder">
                            <Folder size={18} />
                          </div>
                          <div>
                            <div className="scp-name">{p.name}</div>
                            <div className="scp-meta">Playlist</div>
                          </div>
                        </div>
                        <div className="scp-kind">playlist</div>
                        <div className="scp-sel">
                          {sel ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* FOOTER */}
            <div className="scp-footer">
              <span className="scp-selected">
                {picked ? (
                  <>
                    Selected: <b>{(picked.item as any)?.name ?? "item"}</b>
                  </>
                ) : (
                  <>
                    Selected: <b>0</b>
                  </>
                )}
              </span>

              <div className="scp-actions">
                <button className="scp-btn" onClick={() => setSelectedKey(null)} type="button">
                  Deselect
                </button>

                <button
                  className="scp-btn scp-btn-yellow"
                  disabled={!picked}
                  onClick={confirm}
                  type="button"
                >
                  Confirm
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}