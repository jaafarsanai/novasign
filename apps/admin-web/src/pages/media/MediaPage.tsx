import React, { useEffect, useMemo, useRef, useState } from "react";
import "./MediaPage.css";
import { FolderPlus, MoreVertical, Trash2, Upload, Move, ListPlus, Folder, X } from "lucide-react";

type MediaItem = {
  id: string;
  url: string;
  type: string;
  name?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt?: string;
  folderId?: string | null;
};

type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  children: FolderNode[];
};

type Playlist = {
  id: string;
  name: string;
};

type UsageRow = { id: string; name: string };
type MediaUsage = { mediaId: string; playlists: UsageRow[] };

type ConfirmState =
  | null
  | {
      kind: "deleteFolder";
      id: string;
      label: string;
    }
  | {
      kind: "deleteMedia";
      items: Array<{ id: string; label: string }>;
    };

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
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

function absUrl(u?: string) {
  const x = String(u || "");
  if (!x) return x;
  if (x.startsWith("http://") || x.startsWith("https://")) return x;
  return `${window.location.origin}${x.startsWith("/") ? "" : "/"}${x}`;
}

function fmtBytes(n?: number | null) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  if (v < 1024) return `${v} B`;
  const kb = v / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function flattenFolders(nodes: FolderNode[], depth = 0): Array<{ id: string; name: string; depth: number; parentId: string | null }> {
  const out: Array<{ id: string; name: string; depth: number; parentId: string | null }> = [];
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth, parentId: n.parentId });
    if (n.children?.length) out.push(...flattenFolders(n.children, depth + 1));
  }
  return out;
}

function isVideo(t?: string) {
  return String(t || "").toLowerCase() === "video";
}

function collectDescendants(nodes: FolderNode[], startId: string): Set<string> {
  const out = new Set<string>();
  function walk(n: FolderNode) {
    out.add(n.id);
    for (const c of n.children || []) walk(c);
  }
  function findAndWalk(arr: FolderNode[]) {
    for (const n of arr) {
      if (n.id === startId) {
        walk(n);
        return true;
      }
      if (n.children?.length && findAndWalk(n.children)) return true;
    }
    return false;
  }
  findAndWalk(nodes);
  return out;
}

async function getVideoDurationFromFileMs(file: File): Promise<number | null> {
  if (!file) return null;
  if (!file.type?.toLowerCase().startsWith("video/")) return null;

  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;

    const cleanup = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
      v.removeAttribute("src");
      try {
        v.load();
      } catch {}
    };

    v.addEventListener(
      "loadedmetadata",
      () => {
        const seconds = Number(v.duration);
        cleanup();
        if (!Number.isFinite(seconds) || seconds <= 0) return resolve(null);
        resolve(Math.round(seconds * 1000));
      },
      { once: true }
    );

    v.addEventListener(
      "error",
      () => {
        cleanup();
        resolve(null);
      },
      { once: true }
    );

    v.src = url;
  });
}

function uploadWithProgress(
  endpoint: string,
  form: FormData,
  onProgress: (pct: number) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint, true);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
      onProgress(pct);
    };

    xhr.onerror = () => reject(new Error("Upload failed (network error)"));

    xhr.onload = () => {
      const text = xhr.responseText || "";
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`${xhr.status} ${xhr.statusText} ${text}`.trim()));
        return;
      }
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        resolve({});
      }
    };

    xhr.send(form);
  });
}

export default function MediaPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | "image" | "video">("all");

  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);

  const [moving, setMoving] = useState<MediaItem | null>(null);
  const [movingFolder, setMovingFolder] = useState<{ id: string; name: string; parentId: string | null } | null>(null);

  const [adding, setAdding] = useState<MediaItem | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [plLoading, setPlLoading] = useState(false);

  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [usageLoading, setUsageLoading] = useState(false);
  const [usageById, setUsageById] = useState<Map<string, UsageRow[]>>(new Map());

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // upload progress
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadLabel, setUploadLabel] = useState<string>("");

  async function loadFolders() {
    const r = await fetchJson<{ items: FolderNode[] }>(`/api/media/folders`);
    setFolders(r.items || []);
  }

  async function loadMedia() {
    setLoading(true);
    setBanner(null);

    try {
      const params = new URLSearchParams();
      const qq = q.trim();

      if (qq) params.set("search", qq);
      if (type !== "all") params.set("type", type);

      if (!qq && !selectedFolderId) params.set("folderId", "root");
      if (selectedFolderId) params.set("folderId", selectedFolderId);

      const r = await fetchJson<{ items: MediaItem[] }>(`/api/media?${params.toString()}`);
      const list = r.items || [];
      setItems(list);

      setSelectedIds((prev) => {
        const visible = new Set(list.map((x) => x.id));
        const next = new Set<string>();
        for (const id of prev) if (visible.has(id)) next.add(id);
        return next;
      });
    } catch (e: any) {
      setBanner(e?.message ?? "Failed to load media");
      setItems([]);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFolders().catch(() => {});
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => loadMedia(), 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, type, selectedFolderId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".ml-actions")) setOpenMenuId(null);
      if (!target.closest(".ml-folder-actions")) setOpenFolderMenuId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function createFolder() {
    const name = prompt("Folder name?");
    if (!name) return;
    await fetchJson(`/api/media/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: selectedFolderId || null }),
    });
    await loadFolders();
  }

  function requestDeleteFolder(id: string, label: string) {
    setUsageById(new Map());
    setUsageLoading(false);
    setConfirmState({ kind: "deleteFolder", id, label });
  }

  async function requestDeleteMediaBulk(itemsToDelete: Array<{ id: string; label: string }>) {
    setConfirmState({ kind: "deleteMedia", items: itemsToDelete });
    setUsageById(new Map());
    setUsageLoading(true);

    try {
      const ids = itemsToDelete.map((x) => x.id);
      const r = await fetchJson<{ items: MediaUsage[] }>(`/api/media/usage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      const map = new Map<string, UsageRow[]>();
      for (const row of r.items || []) map.set(String(row.mediaId), row.playlists || []);
      setUsageById(map);
    } catch {
      setUsageById(new Map());
    } finally {
      setUsageLoading(false);
    }
  }

  async function doDeleteFolder(id: string) {
    await fetchJson(`/api/media/folders/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (selectedFolderId === id) setSelectedFolderId(null);
    await loadFolders();
  }

  async function doDeleteMediaBulk(ids: string[]) {
    await fetchJson(`/api/media/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    await loadMedia();
  }

  async function moveFolder(id: string, parentId: string | null) {
    await fetchJson(`/api/media/folders/${encodeURIComponent(id)}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId }),
    });
    await loadFolders();
  }

  async function moveMedia(id: string, folderId: string | null) {
    await fetchJson(`/api/media/${encodeURIComponent(id)}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
    await loadMedia();
  }

  function openFilePicker() {
    if (!fileRef.current) return;
    fileRef.current.value = "";
    fileRef.current.click();
  }

  async function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setBanner(null);
    setUploading(true);
    setUploadPct(0);
    setUploadLabel(files.length === 1 ? files[0].name : `${files.length} files`);

    try {
      // Build meta (video duration) before upload
      const meta: Array<{ name: string; size: number; durationMs?: number }> = [];
      for (const f of Array.from(files)) {
        const durationMs = await getVideoDurationFromFileMs(f);
        if (durationMs) meta.push({ name: f.name, size: f.size, durationMs });
        else meta.push({ name: f.name, size: f.size });
      }

      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f, f.name);
      fd.append("meta", JSON.stringify(meta));

      const params = new URLSearchParams();
      if (selectedFolderId) params.set("folderId", selectedFolderId);

      await uploadWithProgress(`/api/media/upload?${params.toString()}`, fd, (pct) => setUploadPct(pct));

      await loadMedia();
    } catch (e: any) {
      setBanner(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      setUploadPct(0);
      setUploadLabel("");
    }
  }

  async function openAddToPlaylist(m: MediaItem) {
    setAdding(m);
    setPlLoading(true);
    try {
      const list = await fetchJson<Playlist[]>(`/api/playlists`);
      setPlaylists(list || []);
    } catch {
      setPlaylists([]);
    } finally {
      setPlLoading(false);
    }
  }

  async function attachToPlaylist(playlistId: string, mediaId: string) {
    await fetchJson(`/api/playlists/${encodeURIComponent(playlistId)}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId }),
    });
  }

  const visibleIds = useMemo(() => items.map((x) => x.id), [items]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  const folderFlat = useMemo(() => flattenFolders(folders), [folders]);

  const invalidMoveFolderTargets = useMemo(() => {
    if (!movingFolder) return new Set<string>();
    return collectDescendants(folders, movingFolder.id);
  }, [folders, movingFolder]);

  const confirmTitle =
    confirmState?.kind === "deleteFolder" ? "Delete folder?" : confirmState?.kind === "deleteMedia" ? "Delete from library?" : "";

  const confirmItems = confirmState?.kind === "deleteMedia" ? confirmState.items : [];

  const confirmMessage =
    confirmState?.kind === "deleteFolder"
      ? `This will permanently delete the folder “${confirmState.label}”. The folder must be empty.`
      : confirmState?.kind === "deleteMedia"
        ? confirmItems.length === 1
          ? `This will permanently delete “${confirmItems[0].label}” from the media library. If it is used by playlists, it will be removed from those playlists too.`
          : `This will permanently delete ${confirmItems.length} files from the media library. If any are used by playlists, they will be removed from those playlists too.`
        : "";

  function playlistsFor(mediaId: string): UsageRow[] {
    return usageById.get(mediaId) || [];
  }

  return (
    <div className="ml-page">
      <div className="ml-topbar">
        <div className="ml-title">Media</div>

        <div className="ml-searchwrap">
          <input className="ml-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Media" />
        </div>

        <select className="ml-filter" value={type} onChange={(e) => setType(e.target.value as any)}>
          <option value="all">All types</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
        </select>

        <button className="ml-btn ml-btn-yellow" onClick={openFilePicker} disabled={uploading}>
          <Upload size={16} />
          {uploading ? "Uploading…" : "Upload"}
        </button>

        <input ref={fileRef} className="ml-hidden" type="file" multiple onChange={(e) => onPickFiles(e.target.files)} />
      </div>

      {uploading ? (
        <div className="ml-uploadbar" role="status" aria-live="polite">
          <div className="ml-uploadtop">
            <div className="ml-uploadtitle">Uploading</div>
            <div className="ml-uploadmeta">
              <span className="ml-uploadfile">{uploadLabel}</span>
              <span className="ml-uploadpct">{uploadPct}%</span>
            </div>
          </div>
          <div className="ml-uploadtrack">
            <div className="ml-uploadfill" style={{ width: `${uploadPct}%` }} />
          </div>
        </div>
      ) : null}

      {banner ? <div className="ml-banner">{banner}</div> : null}

      {selectedCount > 0 ? (
        <div className="ml-bulkbar">
          <div className="ml-bulk-left">
            <span className="ml-bulk-pill">
              Selected <b>{selectedCount}</b>
            </span>
          </div>
          <div className="ml-bulk-right">
            <button className="ml-btn" onClick={() => setSelectedIds(new Set())}>
              Clear
            </button>
            <button
              className="ml-btn ml-btn-danger"
              onClick={() => {
                const itemsToDelete = items
                  .filter((m) => selectedIds.has(m.id))
                  .map((m) => ({ id: m.id, label: String(m.name || "").trim() || "(untitled)" }));
                requestDeleteMediaBulk(itemsToDelete);
              }}
            >
              <Trash2 size={16} />
              Delete selected
            </button>
          </div>
        </div>
      ) : null}

      <div className="ml-body">
        <aside className="ml-folders">
          <div className="ml-folders-head">
            <div className="ml-folders-title">Folders</div>
            <button className="ml-iconbtn" title="New folder" onClick={createFolder} aria-label="New folder">
              <FolderPlus size={16} />
            </button>
          </div>

          <button
            className={`ml-folder ${selectedFolderId === null ? "is-active" : ""}`}
            onClick={() => {
              setSelectedFolderId(null);
              setOpenFolderMenuId(null);
            }}
          >
            <span className="ml-folderlabel">Library</span>
          </button>

          {folderFlat.map((f) => (
            <div
              key={f.id}
              className={`ml-folderrow ${selectedFolderId === f.id ? "is-active" : ""}`}
              style={{ paddingLeft: 10 + f.depth * 14 }}
            >
              <button
                className="ml-folderbtn"
                onClick={() => {
                  setSelectedFolderId(f.id);
                  setOpenFolderMenuId(null);
                }}
                title={f.name}
              >
                <Folder size={14} />
                <span className="ml-folderlabel">{f.name}</span>
              </button>

              <div className="ml-folder-actions">
                <button
                  className="ml-actionbtn"
                  title="Folder menu"
                  aria-label="Folder menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenFolderMenuId(openFolderMenuId === f.id ? null : f.id);
                  }}
                >
                  <MoreVertical size={16} />
                </button>

                {openFolderMenuId === f.id ? (
                  <div className="ml-menu ml-menu-folder" onMouseDown={(e) => e.stopPropagation()}>
                    <button
                      className="ml-menuitem"
                      onClick={() => {
                        setOpenFolderMenuId(null);
                        setMovingFolder({ id: f.id, name: f.name, parentId: f.parentId });
                      }}
                    >
                      <Move size={16} />
                      <span>Move to</span>
                    </button>

                    <div className="ml-menudiv" />

                    <button
                      className="ml-menuitem ml-menuitem-danger"
                      onClick={() => {
                        setOpenFolderMenuId(null);
                        requestDeleteFolder(f.id, f.name);
                      }}
                    >
                      <Trash2 size={16} />
                      <span>Delete folder</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </aside>

        <main className="ml-main">
          <div className="ml-table">
            <div className="ml-head ml-head-withsel">
              <div className="ml-col-sel">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} aria-label="Select all" />
              </div>
              <div className="ml-col-name">NAME</div>
              <div className="ml-col-kind">KIND</div>
              <div className="ml-col-size">SIZE</div>
              <div className="ml-col-up">UPLOADED</div>
              <div className="ml-col-actions" />
            </div>

            {loading ? (
              <div className="ml-empty">Loading…</div>
            ) : items.length === 0 ? (
              <div className="ml-empty">No media found.</div>
            ) : (
              items.map((m) => {
                const kind = isVideo(m.type) ? "Video" : "Image";
                const created = m.createdAt ? new Date(m.createdAt).toLocaleString() : "";
                const name = String(m.name || "").trim() || "(untitled)";
                const checked = selectedIds.has(m.id);

                return (
                  <div className="ml-row ml-row-withsel" key={m.id}>
                    <div className="ml-selcell">
                      <input type="checkbox" checked={checked} onChange={() => toggleSelectOne(m.id)} aria-label={`Select ${name}`} />
                    </div>

                    <div className="ml-namecell">
                      <div className="ml-thumb">
                        {isVideo(m.type) ? <video src={absUrl(m.url)} muted playsInline /> : <img src={absUrl(m.url)} alt="" />}
                      </div>

                      <div className="ml-nameblock">
                        <div className="ml-name" title={name}>
                          {name}
                        </div>
                      </div>
                    </div>

                    <div className="ml-kind">
                      <span className={`ml-pill ${kind === "Video" ? "is-video" : "is-image"}`}>{kind}</span>
                    </div>

                    <div className="ml-size">{fmtBytes(m.sizeBytes)}</div>

                    <div className="ml-up">{created}</div>

                    <div className="ml-actions">
                      <button
                        className="ml-actionbtn ml-danger"
                        title="Delete from library"
                        aria-label="Delete from library"
                        onClick={() => requestDeleteMediaBulk([{ id: m.id, label: name }])}
                      >
                        <Trash2 size={16} />
                      </button>

                      <button className="ml-actionbtn" title="More" aria-label="More" onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)}>
                        <MoreVertical size={16} />
                      </button>

                      {openMenuId === m.id ? (
                        <div className="ml-menu">
                          <button
                            className="ml-menuitem"
                            onClick={async () => {
                              setOpenMenuId(null);
                              await openAddToPlaylist(m);
                            }}
                          >
                            <ListPlus size={16} />
                            <span>Add to Playlists</span>
                          </button>

                          <button
                            className="ml-menuitem"
                            onClick={() => {
                              setOpenMenuId(null);
                              setMoving(m);
                            }}
                          >
                            <Move size={16} />
                            <span>Move to</span>
                          </button>

                          <div className="ml-menudiv" />

                          <button
                            className="ml-menuitem ml-menuitem-danger"
                            onClick={() => {
                              setOpenMenuId(null);
                              requestDeleteMediaBulk([{ id: m.id, label: name }]);
                            }}
                          >
                            <Trash2 size={16} />
                            <span>Delete from library</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>

      {moving ? (
        <div className="ml-modalback" onMouseDown={() => setMoving(null)} role="dialog" aria-modal="true">
          <div className="ml-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ml-modaltop">
              <div className="ml-modaltitle">Move "{String(moving.name || "").trim() || "media"}"?</div>
              <button className="ml-x" onClick={() => setMoving(null)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="ml-modbody">
              <div className="ml-tree">
                <button
                  className="ml-treeitem"
                  onClick={async () => {
                    await moveMedia(moving.id, null);
                    setMoving(null);
                  }}
                >
                  Library
                </button>

                {folderFlat.map((f) => (
                  <button
                    key={f.id}
                    className="ml-treeitem"
                    style={{ paddingLeft: 10 + f.depth * 16 }}
                    onClick={async () => {
                      await moveMedia(moving.id, f.id);
                      setMoving(null);
                    }}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="ml-modalbot">
              <button className="ml-btn" onClick={() => setMoving(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {movingFolder ? (
        <div className="ml-modalback" onMouseDown={() => setMovingFolder(null)} role="dialog" aria-modal="true">
          <div className="ml-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ml-modaltop">
              <div className="ml-modaltitle">Move folder "{movingFolder.name}"?</div>
              <button className="ml-x" onClick={() => setMovingFolder(null)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="ml-modbody">
              <div className="ml-tree">
                <button
                  className="ml-treeitem"
                  onClick={async () => {
                    await moveFolder(movingFolder.id, null);
                    setMovingFolder(null);
                  }}
                >
                  Library (root)
                </button>

                {folderFlat.map((f) => {
                  const disabled = invalidMoveFolderTargets.has(f.id);
                  return (
                    <button
                      key={f.id}
                      className={`ml-treeitem ${disabled ? "is-disabled" : ""}`}
                      style={{ paddingLeft: 10 + f.depth * 16 }}
                      disabled={disabled}
                      title={disabled ? "Cannot move into itself/descendant" : f.name}
                      onClick={async () => {
                        await moveFolder(movingFolder.id, f.id);
                        setMovingFolder(null);
                      }}
                    >
                      {f.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ml-modalbot">
              <button className="ml-btn" onClick={() => setMovingFolder(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {adding ? (
        <div className="ml-modalback" onMouseDown={() => setAdding(null)} role="dialog" aria-modal="true">
          <div className="ml-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ml-modaltop">
              <div className="ml-modaltitle">Add to playlist</div>
              <button className="ml-x" onClick={() => setAdding(null)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="ml-modbody">
              {plLoading ? (
                <div className="ml-empty">Loading playlists…</div>
              ) : playlists.length === 0 ? (
                <div className="ml-empty">No playlists found.</div>
              ) : (
                <div className="ml-playlistlist">
                  {playlists.map((p) => (
                    <button
                      key={p.id}
                      className="ml-playlistrow"
                      onClick={async () => {
                        try {
                          await attachToPlaylist(p.id, adding.id);
                          setAdding(null);
                        } catch (e: any) {
                          setBanner(e?.message ?? "Failed to add to playlist");
                        }
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="ml-modalbot">
              <button className="ml-btn" onClick={() => setAdding(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmState ? (
        <div className="ml-modalback" onMouseDown={() => (confirmBusy ? null : setConfirmState(null))} role="dialog" aria-modal="true">
          <div className="ml-confirm" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ml-confirm-top">
              <div className="ml-confirm-title">{confirmTitle}</div>
              <button className="ml-x" onClick={() => (confirmBusy ? null : setConfirmState(null))} aria-label="Close">
                ×
              </button>
            </div>

            <div className="ml-confirm-body">
              <div className="ml-confirm-text">{confirmMessage}</div>

              {confirmState.kind === "deleteMedia" ? (
                <div className="ml-usage">
                  <div className="ml-usage-head">
                    <div className="ml-usage-title">Playlist usage</div>
                    {usageLoading ? <div className="ml-usage-sub">Loading…</div> : null}
                  </div>

                  {usageLoading ? (
                    <div className="ml-usage-box">Fetching playlist usage…</div>
                  ) : (
                    <div className="ml-usage-list">
                      {confirmItems.map((it) => {
                        const pls = playlistsFor(it.id);
                        return (
                          <div key={it.id} className="ml-usage-item">
                            <div className="ml-usage-file">
                              <X size={16} />
                              <span>{it.label}</span>
                            </div>
                            {pls.length === 0 ? (
                              <div className="ml-usage-pls">Not used by any playlist.</div>
                            ) : (
                              <div className="ml-usage-pls">
                                Used by:
                                <ul>
                                  {pls.map((p) => (
                                    <li key={p.id}>{p.name}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="ml-confirm-bot">
              <button className="ml-btn" onClick={() => setConfirmState(null)} disabled={confirmBusy}>
                Cancel
              </button>

              <button
                className="ml-btn ml-btn-danger"
                disabled={confirmBusy || (confirmState.kind === "deleteMedia" && usageLoading)}
                onClick={async () => {
                  setConfirmBusy(true);
                  setBanner(null);

                  try {
                    if (confirmState.kind === "deleteFolder") {
                      await doDeleteFolder(confirmState.id);
                    } else if (confirmState.kind === "deleteMedia") {
                      const ids = confirmState.items.map((x) => x.id);
                      await doDeleteMediaBulk(ids);
                      setSelectedIds(new Set());
                    }
                    setConfirmState(null);
                  } catch (e: any) {
                    setBanner(e?.message ?? "Action failed");
                  } finally {
                    setConfirmBusy(false);
                  }
                }}
              >
                {confirmBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

