import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./PlaylistDetailsPage.css";

type Media = {
  id: string;
  url: string;
  type: "image" | "video" | string;
  sizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
};

type PlaylistItem = {
  id: string;
  playlistId: string;
  mediaId: string;
  order: number;
  duration: number; // ms (as stored)
  createdAt: string;
  updatedAt: string;
  media: Media;
};

type Playlist = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: PlaylistItem[];
};

function toAbsoluteMediaUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${window.location.origin}${url}`;
}

function isVideoType(t: string | undefined | null): boolean {
  return String(t || "").toLowerCase() === "video";
}

function formatMs(ms: number): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const totalSec = Math.round(n / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export default function PlaylistDetailsPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);

  const [editMode, setEditMode] = useState(false);

  // Rename
  const [nameDraft, setNameDraft] = useState("");

  // Upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [durationMs, setDurationMs] = useState<number>(5000);
  const [selectedFileKind, setSelectedFileKind] = useState<"image" | "video" | null>(null);
  const [durationLocked, setDurationLocked] = useState(false);

  // Preview modal
  const [previewItem, setPreviewItem] = useState<PlaylistItem | null>(null);

  const itemsSorted = useMemo(() => {
    const items = (playlist?.items ?? []).slice();
    items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return items;
  }, [playlist]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/playlists/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load playlist (${res.status})`);
      const data = (await res.json()) as Playlist;
      setPlaylist(data);
      setNameDraft(data?.name ?? "");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load playlist");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function renamePlaylist() {
    if (!playlist) return;
    const trimmed = (nameDraft || "").trim();
    if (!trimmed) return;

    setErr(null);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error(`Rename failed (${res.status})`);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Rename failed");
    }
  }

  async function deleteItem(itemId: string) {
    if (!playlist) return;
    setErr(null);

    try {
      const res = await fetch(`/api/playlists/${playlist.id}/items/${itemId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Delete failed");
    }
  }

  async function uploadItem() {
    if (!playlist) return;

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setErr("Select a file first.");
      return;
    }

    // For videos we lock duration and use detected ms.
    const d = Number(durationMs);
    const finalDuration = Number.isFinite(d) && d > 0 ? d : 5000;

    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("durationMs", String(finalDuration));

      const res = await fetch(`/api/playlists/${playlist.id}/items/upload`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Upload failed (${res.status}) ${txt}`.trim());
      }

      // reset input
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedFileKind(null);
      setDurationLocked(false);
      setDurationMs(5000);

      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onFileSelected() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setSelectedFileKind(null);
      setDurationLocked(false);
      setDurationMs(5000);
      return;
    }

    const mt = String(file.type || "").toLowerCase();
    const isVid = mt.startsWith("video/");
    const isImg = mt.startsWith("image/");

    if (isVid) {
      setSelectedFileKind("video");
      setDurationLocked(true);

      // detect duration from metadata (not editable)
      try {
        const objectUrl = URL.createObjectURL(file);
        const vid = document.createElement("video");
        vid.preload = "metadata";
        vid.src = objectUrl;

        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            try {
              URL.revokeObjectURL(objectUrl);
            } catch {}
          };

          vid.onloadedmetadata = () => {
            const seconds = Number(vid.duration);
            cleanup();
            if (Number.isFinite(seconds) && seconds > 0) {
              setDurationMs(Math.ceil(seconds * 1000));
            } else {
              // fallback if duration can't be read
              setDurationMs(10000);
            }
            resolve();
          };

          vid.onerror = () => {
            cleanup();
            setDurationMs(10000);
            reject(new Error("Could not read video metadata"));
          };
        });
      } catch {
        // ignore; already set fallback
      }

      return;
    }

    if (isImg) {
      setSelectedFileKind("image");
      setDurationLocked(false);
      // keep last image durationMs (default 5000)
      return;
    }

    // unknown -> treat as image-like (duration editable)
    setSelectedFileKind("image");
    setDurationLocked(false);
  }

  const pageTitle = "Playlist";

  return (
    <div className="pl-page">
      <div className="pl-header">
        <div>
          <h1 className="pl-title">{pageTitle}</h1>
          <div className="pl-subtitle">
            Playlist ID: <span className="pl-mono">{id}</span>
          </div>
        </div>

        <div className="pl-header-actions">
          <button className="pl-btn pl-btn-secondary" onClick={() => navigate("/playlists")}>
            Back
          </button>

          <button className="pl-btn" onClick={() => setEditMode((v) => !v)} disabled={loading || !playlist}>
            {editMode ? "Done" : "Edit"}
          </button>
        </div>
      </div>

      {err ? <div className="pl-alert">{err}</div> : null}

      {loading ? (
        <div className="pl-card">Loading…</div>
      ) : !playlist ? (
        <div className="pl-card">Playlist not found.</div>
      ) : (
        <>
          <div className="pl-card">
            <div className="pl-card-title">Details</div>

            <div className="pl-details-grid">
              <div className="pl-field">
                <div className="pl-label">Name</div>
                {editMode ? (
                  <div className="pl-row">
                    <input
                      className="pl-input"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="Playlist name"
                    />
                    <button className="pl-btn pl-btn-small" onClick={renamePlaylist}>
                      Save
                    </button>
                  </div>
                ) : (
                  <div className="pl-value">{playlist.name}</div>
                )}
              </div>

              <div className="pl-field">
                <div className="pl-label">Items</div>
                <div className="pl-value">{itemsSorted.length}</div>
              </div>

              <div className="pl-field">
                <div className="pl-label">Updated</div>
                <div className="pl-value">{new Date(playlist.updatedAt).toLocaleString()}</div>
              </div>
            </div>
          </div>

          {editMode ? (
            <div className="pl-card">
              <div className="pl-card-title">Upload</div>

              <div className="pl-upload-row">
                <div className="pl-upload-left">
                  <div className="pl-label">File (image/video)</div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="pl-file"
                    accept="image/*,video/*"
                    onChange={onFileSelected}
                  />
                  <div className="pl-hint">
                    Supports images and videos. Videos will use auto-detected duration.
                  </div>
                </div>

                <div className="pl-upload-right">
                  <div className="pl-label">
                    Duration (ms){" "}
                    {selectedFileKind === "video" ? <span className="pl-pill">auto</span> : null}
                  </div>

                  <input
                    className="pl-input"
                    type="number"
                    min={100}
                    step={100}
                    value={durationMs}
                    disabled={durationLocked}
                    onChange={(e) => setDurationMs(Number(e.target.value))}
                  />

                  {durationLocked ? (
                    <div className="pl-hint">Detected: {formatMs(durationMs)}</div>
                  ) : (
                    <div className="pl-hint">Used for images (recommended 5000ms).</div>
                  )}
                </div>

                <div className="pl-upload-actions">
                  <button className="pl-btn" onClick={uploadItem} disabled={uploading}>
                    {uploading ? "Uploading…" : "Upload"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="pl-card">
            <div className="pl-card-title pl-items-title">
              <span>Items</span>
              <button className="pl-btn pl-btn-secondary pl-btn-small" onClick={load}>
                Refresh
              </button>
            </div>

            {itemsSorted.length === 0 ? (
              <div className="pl-empty">No items yet.</div>
            ) : (
              <div className="pl-grid">
                {itemsSorted.map((it) => {
                  const abs = toAbsoluteMediaUrl(it.media?.url ?? "");
                  const isVid = isVideoType(it.media?.type);

                  return (
                    <div className="pl-item" key={it.id}>
                      <button className="pl-cardbtn" onClick={() => setPreviewItem(it)} title="Preview">
                        <div className="pl-thumb">
                          {isVid ? (
                            <>
                              <video src={abs} muted playsInline preload="metadata" />
                              <div className="pl-playbadge">▶</div>
                            </>
                          ) : (
                            <img src={abs} alt="" loading="lazy" />
                          )}
                        </div>
                      </button>

                      {editMode ? (
                        <button
                          className="pl-del"
                          onClick={() => deleteItem(it.id)}
                          title="Delete"
                          aria-label="Delete"
                        >
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <path
                              fill="currentColor"
                              d="M9 3h6l1 2h5v2h-2l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H3V5h5l1-2zm-2 4 1 14h8l1-14H7zm3 2h2v10h-2V9zm4 0h2v10h-2V9z"
                            />
                          </svg>
                        </button>
                      ) : null}

                      <div className="pl-meta">
                        <div className="pl-meta-top">
                          <div className="pl-order">#{it.order}</div>
                          <div className="pl-type">{isVid ? "Video" : "Image"}</div>
                        </div>

                        <div className="pl-meta-bottom">
                          <div className="pl-duration">
                            Duration: <span className="pl-mono">{formatMs(it.duration)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {previewItem ? (
            <div className="pl-modal" role="dialog" aria-modal="true" onMouseDown={() => setPreviewItem(null)}>
              <div className="pl-modal-inner" onMouseDown={(e) => e.stopPropagation()}>
                <div className="pl-modal-head">
                  <div className="pl-modal-title">
                    #{previewItem.order} • {isVideoType(previewItem.media?.type) ? "Video" : "Image"} •{" "}
                    {formatMs(previewItem.duration)}
                  </div>
                  <button className="pl-btn pl-btn-secondary pl-btn-small" onClick={() => setPreviewItem(null)}>
                    Close
                  </button>
                </div>

                <div className="pl-modal-body">
                  {isVideoType(previewItem.media?.type) ? (
                    <video
                      src={toAbsoluteMediaUrl(previewItem.media?.url ?? "")}
                      controls
                      autoPlay
                      playsInline
                    />
                  ) : (
                    <img src={toAbsoluteMediaUrl(previewItem.media?.url ?? "")} alt="" />
                  )}
                </div>

                <div className="pl-modal-foot">
                  <a
                    className="pl-link"
                    href={toAbsoluteMediaUrl(previewItem.media?.url ?? "")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {previewItem.media?.url}
                  </a>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

