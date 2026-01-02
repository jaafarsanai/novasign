import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./PlaylistEditPage.css";
import { ArrowLeft, Eye, GripVertical, Tag, Trash2, X } from "lucide-react";
import MediaPickerModal from "./components/MediaPickerModal";

type Media = {
  id: string;
  url: string;
  type: "image" | "video" | string;
  name?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  durationMs?: number | null; // ✅ from library (server ffprobe)
};

type PlaylistItem = {
  id: string;
  playlistId: string;
  mediaId: string;
  order: number;
  duration: number | null; // ms (can be null for videos)
  media: Media;
};

type Playlist = {
  id: string;
  name: string;
  tags?: string[];
  items: PlaylistItem[];
};

type ConfirmState =
  | null
  | {
      kind: "removeItems";
      itemIds: string[];
      labels: string[];
    };

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { ...(init?.headers || {}) },
    ...init,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw Object.assign(new Error(`${res.status} ${res.statusText} ${txt}`.trim()), { status: res.status });
  }

  return res.json() as Promise<T>;
}

function absMediaUrl(u: string): string {
  if (!u) return u;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `${window.location.origin}${u.startsWith("/") ? "" : "/"}${u}`;
}

function msToHms(ms: number) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function editorTimeToMs(v: string) {
  const raw = (v || "").trim();
  if (!raw) return NaN;

  const parts = raw.split(":").map((x) => x.trim());
  if (parts.some((p) => p === "" || Number.isNaN(Number(p)))) return NaN;

  if (parts.length === 2) {
    const mm = Number(parts[0]);
    const ss = Number(parts[1]);
    return (mm * 60 + ss) * 1000;
  }

  if (parts.length === 3) {
    const hh = Number(parts[0]);
    const mm = Number(parts[1]);
    const ss = Number(parts[2]);
    return (hh * 3600 + mm * 60 + ss) * 1000;
  }

  return NaN;
}

function isVideoType(t?: string) {
  return String(t || "").toLowerCase() === "video";
}

function fileNameFromUrl(u: string) {
  try {
    const p = u.split("?")[0];
    const seg = p.split("/").filter(Boolean);
    return decodeURIComponent(seg[seg.length - 1] || u);
  } catch {
    return u;
  }
}

function displayNameForItem(it: PlaylistItem) {
  const n = (it?.media?.name || "").trim();
  if (n) return n;
  const u = String(it?.media?.url || "");
  const byUrl = fileNameFromUrl(u);
  return byUrl || it.mediaId || it.id;
}

function arrayMove<T>(arr: T[], from: number, to: number) {
  const copy = arr.slice();
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
}

async function getVideoDurationMs(mediaUrlAbs: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;

    const cleanup = () => {
      v.removeAttribute("src");
      try {
        v.load();
      } catch {}
    };

    const onLoaded = () => {
      const seconds = Number(v.duration);
      cleanup();
      if (!Number.isFinite(seconds) || seconds <= 0) return reject(new Error("Invalid video duration"));
      resolve(Math.round(seconds * 1000));
    };

    const onError = () => {
      cleanup();
      reject(new Error("Failed to load video metadata"));
    };

    v.addEventListener("loadedmetadata", onLoaded, { once: true });
    v.addEventListener("error", onError, { once: true });

    v.src = mediaUrlAbs;
  });
}

export default function PlaylistEditorPage() {
  const { id = "" } = useParams();
  const playlistId = id.trim();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [tagsDraft, setTagsDraft] = useState("");

  const [itemsDraft, setItemsDraft] = useState<PlaylistItem[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);

  const [durationPersistSupported, setDurationPersistSupported] = useState<boolean | null>(null);
  const [durationInfo, setDurationInfo] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<PlaylistItem | null>(null);

  // DnD
  const dragIdRef = useRef<string | null>(null);

  // Prevent repeated duration probes
  const probedDurationIdsRef = useRef<Set<string>>(new Set());

  // Multi-select for playlist items
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  // Styled confirm modal
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  async function load() {
    if (!playlistId) return;
    setLoading(true);
    setErr(null);

    try {
      const p = await apiJson<Playlist>(`/api/playlists/${playlistId}`);
      const sorted = (p.items || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const normalized = sorted.map((it, idx) => ({
        ...it,
        order: idx + 1,
        duration: it.duration == null ? null : Number(it.duration),
      }));

      setPlaylist(p);
      setNameDraft(p.name || "");
      setTagsDraft((p.tags || []).join(", "));
      setItemsDraft(normalized);
      setOrderDirty(false);

      // Reset probe cache on full reload so new items get processed
      probedDurationIdsRef.current = new Set();

      // Prune selection to existing items
      setSelectedItemIds((prev) => {
        const existing = new Set(normalized.map((x) => x.id));
        const next = new Set<string>();
        for (const id of prev) if (existing.has(id)) next.add(id);
        return next;
      });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load playlist");
      setPlaylist(null);
      setItemsDraft([]);
      setSelectedItemIds(new Set());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  const totalDurationMs = useMemo(() => {
    return itemsDraft.reduce((acc, it) => acc + (Number(it.duration) || 0), 0);
  }, [itemsDraft]);

  async function saveDetailsOnly() {
    const name = (nameDraft || "").trim() || "Untitled";
    const tags = (tagsDraft || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    await apiJson(`/api/playlists/${playlistId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, tags }),
    });
  }

  async function saveOrderIfDirty() {
    if (!orderDirty) return;

    const itemIds = itemsDraft
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((x) => x.id);

    await apiJson(`/api/playlists/${playlistId}/items/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds }),
    });

    setOrderDirty(false);
  }

  async function publish() {
    if (!playlistId) return;
    setSaving(true);
    setErr(null);

    try {
      await saveOrderIfDirty();
      await saveDetailsOnly();
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function persistDurationIfSupported(itemId: string, durationMs: number) {
    if (!playlistId) return;
    if (durationPersistSupported === false) return;

    try {
      await apiJson(`/api/playlists/${playlistId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMs }),
      });
      setDurationPersistSupported(true);
    } catch (e: any) {
      const status = e?.status ?? 0;
      if (status === 404) {
        setDurationPersistSupported(false);
        setDurationInfo("Duration saving is not available on the backend yet.");
      } else {
        setErr(e?.message ?? "Duration update failed");
      }
    }
  }

  function setItemDurationLocal(itemId: string, durationMs: number | null) {
    setItemsDraft((prev) => prev.map((it) => (it.id === itemId ? { ...it, duration: durationMs } : it)));
  }

  function onDragStart(e: React.DragEvent, itemId: string) {
    dragIdRef.current = itemId;
    e.dataTransfer.setData("text/plain", itemId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDrop(overItemId: string) {
    const dragId = dragIdRef.current;
    dragIdRef.current = null;

    if (!dragId || dragId === overItemId) return;

    const from = itemsDraft.findIndex((x) => x.id === dragId);
    const to = itemsDraft.findIndex((x) => x.id === overItemId);
    if (from < 0 || to < 0) return;

    const next = arrayMove(itemsDraft, from, to).map((it, idx) => ({ ...it, order: idx + 1 }));
    setItemsDraft(next);
    setOrderDirty(true);
  }

  const sortedItems = useMemo(() => {
    return itemsDraft.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [itemsDraft]);

  // selection helpers
  const allSelected = sortedItems.length > 0 && sortedItems.every((x) => selectedItemIds.has(x.id));
  const selectedCount = selectedItemIds.size;

  function toggleSelectOne(id: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const it of sortedItems) next.delete(it.id);
      } else {
        for (const it of sortedItems) next.add(it.id);
      }
      return next;
    });
  }

  function requestRemoveItems(itemIds: string[]) {
    const ids = Array.from(new Set(itemIds)).filter(Boolean);
    const labelById = new Map(sortedItems.map((it) => [it.id, displayNameForItem(it)] as const));
    const labels = ids.map((id) => labelById.get(id) || id);

    setConfirmState({ kind: "removeItems", itemIds: ids, labels });
  }

  async function doRemoveItems(itemIds: string[]) {
    const ids = Array.from(new Set(itemIds)).filter(Boolean);
    if (ids.length === 0) return;

    for (const id of ids) {
      await apiJson(`/api/playlists/${playlistId}/items/${id}`, { method: "DELETE" });
    }
  }

  // ✅ Auto-fill missing video duration (prefer library durationMs if present)
  useEffect(() => {
    if (loading) return;
    if (!playlistId) return;
    if (!sortedItems.length) return;

    let cancelled = false;

    const run = async () => {
      for (const it of sortedItems) {
        if (cancelled) return;
        if (!isVideoType(it.media?.type)) continue;

        const current = Number(it.duration) || 0;
        if (current > 0) continue;

        if (probedDurationIdsRef.current.has(it.id)) continue;
        probedDurationIdsRef.current.add(it.id);

        // 1) Prefer server-known duration
        const libMs = Number(it.media?.durationMs || 0);
        if (Number.isFinite(libMs) && libMs > 0) {
          setItemDurationLocal(it.id, libMs);
          await persistDurationIfSupported(it.id, libMs);
          continue;
        }

        // 2) Fallback to browser probe
        const urlAbs = absMediaUrl(it.media?.url || "");
        if (!urlAbs) continue;

        try {
          const ms = await getVideoDurationMs(urlAbs);
          if (cancelled) return;

          setItemDurationLocal(it.id, ms);
          await persistDurationIfSupported(it.id, ms);
        } catch {
          // silent
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, playlistId, sortedItems.map((x) => `${x.id}:${x.duration ?? 0}:${x.media?.url ?? ""}:${x.media?.type ?? ""}:${x.media?.durationMs ?? 0}`).join("|")]);

  return (
    <div className="pe-page">
      <div className="pe-topbar">
        <div className="pe-top-left">
          <button className="pe-backbtn" onClick={() => nav("/playlists")} title="Back" aria-label="Back">
            <ArrowLeft size={18} />
          </button>

          <div className="pe-titleblock">
            <input
              className="pe-titleinput"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Playlist name"
              aria-label="Playlist name"
            />

            <div className="pe-meta">
              <Tag size={14} />
              <input
                className="pe-taginput"
                value={tagsDraft}
                onChange={(e) => setTagsDraft(e.target.value)}
                placeholder="add tags"
                aria-label="Playlist tags"
              />
            </div>
          </div>
        </div>

        <div className="pe-actions">
          <button
            className="pe-iconbtn"
            onClick={() => setPreviewItem(sortedItems[0] || null)}
            disabled={sortedItems.length === 0}
            title={sortedItems.length === 0 ? "No items to preview" : "Preview"}
            aria-label="Preview"
          >
            <Eye size={18} />
          </button>

          <button className="pe-btn pe-btn-primary" onClick={publish} disabled={saving || loading}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {err ? <div className="pe-alert pe-alert-danger">{err}</div> : null}
      {durationInfo ? <div className="pe-alert">{durationInfo}</div> : null}

      {selectedCount > 0 ? (
        <div className="pe-bulkbar">
          <div className="pe-bulk-left">
            <span className="pe-bulk-pill">
              Selected <b>{selectedCount}</b>
            </span>
          </div>
          <div className="pe-bulk-right">
            <button className="pe-btn" onClick={() => setSelectedItemIds(new Set())}>
              Clear
            </button>
            <button className="pe-btn pe-btn-danger" onClick={() => requestRemoveItems(Array.from(selectedItemIds))}>
              <Trash2 size={16} />
              Remove selected
            </button>
          </div>
        </div>
      ) : null}

      <div className="pe-body">
        <div>
          <div className="pe-mainhead">
            <div className="pe-duration">
              Total Duration
              <strong>{msToHms(totalDurationMs)}</strong>
            </div>

            <div className="pe-mainhead-right">
              {sortedItems.length > 0 ? (
                <label className="pe-selectall">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                  <span>Select all</span>
                </label>
              ) : null}

              <button className="pe-addbtn" onClick={() => setPickerOpen(true)} disabled={loading || !playlistId}>
                <span className="pe-plus" aria-hidden="true">
                  +
                </span>
                Add Content
              </button>
            </div>
          </div>

          {loading ? (
            <div className="pe-empty">Loading…</div>
          ) : !playlist ? (
            <div className="pe-empty">Playlist not found.</div>
          ) : sortedItems.length === 0 ? (
            <div className="pe-emptybox">
              <div className="pe-emptytitle">No content yet</div>
              <div className="pe-emptysub">Click “Add Content” to start building your playlist.</div>
              <button className="pe-btn pe-btn-primary" onClick={() => setPickerOpen(true)}>
                Add Content
              </button>
            </div>
          ) : (
            <div className="pe-card">
              {sortedItems.map((it) => {
                const isVideo = isVideoType(it.media?.type);
                const mediaUrl = absMediaUrl(it.media?.url || "");
                const displayName = displayNameForItem(it);
                const timeValue = msToHms(Number(it.duration) || 0);
                const checked = selectedItemIds.has(it.id);

                return (
                  <div
                    key={it.id}
                    className={`pe-item ${checked ? "is-selected" : ""}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, it.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={() => onDrop(it.id)}
                    title="Drag to reorder"
                  >
                    <div className="pe-sel">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelectOne(it.id)}
                        aria-label={`Select ${displayName}`}
                      />
                    </div>

                    <div className="pe-thumb">
                      {isVideo ? <video src={mediaUrl} muted playsInline /> : <img src={mediaUrl} alt="" />}
                    </div>

                    <div className="pe-filename" title={displayName}>
                      {displayName}
                    </div>

                    <input
                      className="pe-durationinput"
                      value={timeValue}
                      onChange={(e) => {
                        const ms = editorTimeToMs(e.target.value);
                        if (Number.isFinite(ms)) setItemDurationLocal(it.id, ms);
                      }}
                      onBlur={(e) => {
                        const ms = editorTimeToMs(e.target.value);
                        if (!Number.isFinite(ms) || ms < 1000) return;
                        setItemDurationLocal(it.id, ms);
                        persistDurationIfSupported(it.id, ms);
                      }}
                      inputMode="numeric"
                      placeholder="00:00:10"
                      aria-label="Duration"
                      disabled={isVideo}
                    />

                    <div className="pe-type">{isVideo ? "Video" : "Image"}</div>

                    <button className="pe-icon" title="Drag" aria-label="Drag">
                      <GripVertical size={16} />
                    </button>

                    <button
                      className="pe-icon pe-icon-danger"
                      title="Remove from playlist"
                      aria-label="Remove from playlist"
                      onClick={() => requestRemoveItems([it.id])}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="pe-side">
          <div className="pe-tabs">
            <button className="pe-tab is-active" type="button">
              CONTENT
            </button>
            <button className="pe-tab" type="button" disabled>
              SETTINGS
            </button>
          </div>

          <div className="pe-sidebody">
            <div className="pe-sidehint">
              Use <b>Add Content</b> to upload/select media and add it to this playlist.
            </div>
          </div>
        </div>
      </div>

      <MediaPickerModal
        open={pickerOpen}
        playlistId={playlistId}
        onClose={() => setPickerOpen(false)}
        onAdded={async () => {
          setPickerOpen(false);
          await load();
        }}
      />

      {previewItem ? (
        <div className="pe-preview-backdrop" onClick={() => setPreviewItem(null)} role="button" tabIndex={0}>
          <div className="pe-preview" onClick={(e) => e.stopPropagation()}>
            <div className="pe-preview-top">
              <div className="pe-preview-title">{String(previewItem.media?.type || "PREVIEW").toUpperCase()}</div>
              <button className="pe-btn" onClick={() => setPreviewItem(null)}>
                Close
              </button>
            </div>
            <div className="pe-preview-body">
              {isVideoType(previewItem.media?.type) ? (
                <video src={absMediaUrl(previewItem.media?.url || "")} controls autoPlay />
              ) : (
                <img src={absMediaUrl(previewItem.media?.url || "")} alt="" />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* STYLED CONFIRM MODAL (REMOVE FROM PLAYLIST ONLY) */}
      {confirmState ? (
        <div className="pe-confirm-backdrop" onMouseDown={() => (confirmBusy ? null : setConfirmState(null))} role="dialog" aria-modal="true">
          <div className="pe-confirm" onMouseDown={(e) => e.stopPropagation()}>
            <div className="pe-confirm-top">
              <div className="pe-confirm-title">
                {confirmState.itemIds.length === 1 ? "Remove item from playlist?" : `Remove ${confirmState.itemIds.length} items from playlist?`}
              </div>
              <button className="pe-confirm-x" onClick={() => (confirmBusy ? null : setConfirmState(null))} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="pe-confirm-body">
              <div className="pe-confirm-text">
                This will remove the selected content from this playlist only. The media will remain in the library.
              </div>

              <div className="pe-confirm-list">
                {confirmState.labels.slice(0, 8).map((lab, idx) => (
                  <div className="pe-confirm-row" key={`${lab}-${idx}`}>
                    <Trash2 size={16} />
                    <span>{lab}</span>
                  </div>
                ))}
                {confirmState.labels.length > 8 ? <div className="pe-confirm-more">+ {confirmState.labels.length - 8} more…</div> : null}
              </div>
            </div>

            <div className="pe-confirm-bot">
              <button className="pe-btn" onClick={() => setConfirmState(null)} disabled={confirmBusy}>
                Cancel
              </button>
              <button
                className="pe-btn pe-btn-danger"
                disabled={confirmBusy}
                onClick={async () => {
                  setConfirmBusy(true);
                  setErr(null);

                  try {
                    await doRemoveItems(confirmState.itemIds);
                    setConfirmState(null);
                    setSelectedItemIds(new Set());
                    await load();
                  } catch (e: any) {
                    setErr(e?.message ?? "Remove failed");
                  } finally {
                    setConfirmBusy(false);
                  }
                }}
              >
                {confirmBusy ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

