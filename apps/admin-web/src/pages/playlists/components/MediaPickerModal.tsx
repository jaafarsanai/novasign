import React, { useEffect, useMemo, useRef, useState } from "react";
import "./MediaPickerModal.css";
import {
  X,
  Search,
  Upload as UploadIcon,
  CheckCircle2,
  Circle,
  Pencil,
  RotateCw,
  Folder,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ImageEditorModal, { EditedImageResult } from "./ImageEditorModal";

type MediaItem = {
  id: string;
  url: string;
  type?: string; // "image" | "video"
  name?: string;
  createdAt?: string;
};

type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  children: FolderNode[];
};

type Props = {
  open: boolean;
  playlistId: string;
  onClose: () => void;
  onAdded?: () => void;
};

type TabKey = "media" | "links" | "canvas" | "apps" | "quickpost";
type ViewKey = "library" | "upload";
type LibraryMode = "global" | "playlist_fallback";

type TypeFilter = "all" | "image" | "video";

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

async function tryFetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  try {
    const data = await fetchJson<T>(path, init);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, status: e?.status ?? 0, error: e?.message ?? "Request failed" };
  }
}

function absUrl(u?: string) {
  const x = String(u || "");
  if (!x) return x;
  if (x.startsWith("http://") || x.startsWith("https://")) return x;
  return `${window.location.origin}${x.startsWith("/") ? "" : "/"}${x}`;
}

function guessTypeFromName(name?: string): "image" | "video" | "unknown" {
  const n = String(name || "").toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n)) return "image";
  if (/\.(mp4|webm|mov|m4v|avi|mkv)$/.test(n)) return "video";
  return "unknown";
}

function nameFromUrl(url?: string) {
  const u = String(url || "");
  if (!u) return "";
  try {
    const path = u.split("?")[0];
    const last = path.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(last);
  } catch {
    return u.split("?")[0].split("/").filter(Boolean).pop() || "";
  }
}

type UploadDraft = {
  id: string;
  file?: File;
  source: "device" | "url";
  url?: string;
  name: string;
  kind: "image" | "video" | "unknown";
  previewUrl?: string;
  editedBlob?: Blob;
  editedPreviewUrl?: string;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function buildFolderIndex(nodes: FolderNode[]) {
  const byId = new Map<string, FolderNode>();
  const parentToChildren = new Map<string | null, FolderNode[]>();

  function walk(list: FolderNode[], parentId: string | null) {
    parentToChildren.set(parentId, list);
    for (const n of list) {
      byId.set(n.id, n);
      walk(n.children || [], n.id);
    }
  }

  walk(nodes || [], null);

  return { byId, parentToChildren, roots: parentToChildren.get(null) || [] };
}

/**
 * Upload with progress (XHR) because fetch() does not expose upload progress.
 * Returns parsed JSON if possible, otherwise {}.
 */
function uploadWithProgress(endpoint: string, form: FormData, onProgress: (pct: number) => void): Promise<any> {
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

/**
 * Extract duration from a Blob (video) in ms.
 */
async function getVideoDurationFromBlobMs(blob: Blob, kindHint?: "image" | "video" | "unknown"): Promise<number | null> {
  if (!blob) return null;

  const mime = String((blob as any).type || "").toLowerCase();
  const isVideoMime = mime.startsWith("video/");
  const isVideoHint = kindHint === "video";

  if (!isVideoMime && !isVideoHint) return null;

  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(blob);
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

/** NEW: left folders selection model */
type ActiveFolderKey = "__ALL__" | "__LIBRARY__" | string;

export default function MediaPickerModal({ open, playlistId, onClose, onAdded }: Props) {
  const [tab, setTab] = useState<TabKey>("media");
  const [view, setView] = useState<ViewKey>("library");

  // Library
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [loading, setLoading] = useState(false);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<string | null>(null);
  const [libraryMode, setLibraryMode] = useState<LibraryMode>("global");

  // Folder browsing (tree endpoint)
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);

  // NEW: what is selected in the left folders panel
  const [activeFolder, setActiveFolder] = useState<ActiveFolderKey>("__ALL__");

  // Upload
  const [uploads, setUploads] = useState<UploadDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Editor
  const [editing, setEditing] = useState<UploadDraft | null>(null);

  // close on escape + lock scroll
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // reset when opening
  useEffect(() => {
    if (!open) return;
    setTab("media");
    setView("library");
    setBanner(null);
    setSelected(new Set());
    setLibrary([]);
    setLibraryMode("global");
    setFolderId(null);
    setActiveFolder("__ALL__"); // ✅ default to All
    setUploading(false);
    setUploadPct(0);
    setQ("");
    setTypeFilter("all");
  }, [open]);

  function cleanupUploads(list: UploadDraft[] = uploads) {
    for (const u of list) {
      if (u.previewUrl) URL.revokeObjectURL(u.previewUrl);
      if (u.editedPreviewUrl) URL.revokeObjectURL(u.editedPreviewUrl);
    }
  }

  function openFilePicker() {
    const el = fileInputRef.current;
    if (!el) return;
    el.value = "";
    el.click();
  }

  async function loadFolders() {
    if (!open) return;
    const r = await tryFetchJson<{ items: FolderNode[] }>(`/api/media/folders`);
    if (r.ok) setFolders(r.data.items || []);
    else setFolders([]);
  }

  /**
   * ✅ FIXED: Library loading uses activeFolder (All/Library/<folder>)
   * - "__ALL__": no folderId param => backend should return everything
   * - "__LIBRARY__": folderId=root (root listing like your old behavior)
   * - "<id>": folderId=<id>
   *
   * If your backend requires explicit "folderId=root" for root, keep it only for Library.
   */
  async function loadLibrary() {
    if (!open) return;

    setLoading(true);
    setBanner(null);

    const params = new URLSearchParams();
    const qq = q.trim();

    if (qq) params.set("search", qq);

    const isAll = activeFolder === "__ALL__";
    const isLibrary = activeFolder === "__LIBRARY__";

    // Keep folder tree browsing disabled when searching (like before)
    // But still allow ALL results when searching.
    if (!qq) {
      if (isLibrary) {
        // Root browsing (previous behavior)
        params.set("folderId", "root");
      } else if (!isAll && typeof activeFolder === "string") {
        // specific folder
        params.set("folderId", activeFolder);
      }
      // isAll => no folderId param
    }

    const rGlobal = await tryFetchJson<{ items: MediaItem[] }>(`/api/media?${params.toString()}`);
    if (rGlobal.ok) {
      setLibraryMode("global");
      setLibrary((rGlobal.data.items || []).map((m) => ({ ...m, name: m.name || nameFromUrl(m.url) })));
      setLoading(false);
      return;
    }

    // Fallbacks remain unchanged
    const rItems = await tryFetchJson<{ items: any[] }>(`/api/playlists/${encodeURIComponent(playlistId)}/items`);
    if (rItems.ok) {
      setLibraryMode("playlist_fallback");
      const items = Array.isArray(rItems.data.items) ? rItems.data.items : [];
      const mapped: MediaItem[] = items.map((it: any) => ({
        id: String(it?.id ?? it?._id ?? uid()),
        url: String(it?.url ?? it?.src ?? it?.mediaUrl ?? it?.media?.url ?? ""),
        type: String(it?.type ?? it?.kind ?? it?.media?.type ?? guessTypeFromName(it?.name ?? it?.url)).toLowerCase(),
        name: String(it?.name ?? it?.originalName ?? it?.media?.name ?? nameFromUrl(it?.url) ?? it?.id ?? ""),
        createdAt: it?.createdAt ?? it?.created_at ?? it?.media?.createdAt,
      }));
      setLibrary(mapped.filter((x) => !!x.url));
      setBanner(
        "Global media library endpoint not found (GET /api/media...). Showing fallback from this playlist details. " +
          "To get a shared library, implement GET /api/media (list/search) and POST /api/media/upload."
      );
      setLoading(false);
      return;
    }

    const rPlaylist = await tryFetchJson<any>(`/api/playlists/${encodeURIComponent(playlistId)}`);
    if (rPlaylist.ok) {
      setLibraryMode("playlist_fallback");
      const items = (rPlaylist.data?.items ?? rPlaylist.data?.playlist?.items ?? []) as any[];
      const mapped: MediaItem[] = (Array.isArray(items) ? items : []).map((it: any) => ({
        id: String(it?.id ?? it?._id ?? uid()),
        url: String(it?.url ?? it?.src ?? it?.mediaUrl ?? it?.media?.url ?? ""),
        type: String(it?.type ?? it?.kind ?? it?.media?.type ?? guessTypeFromName(it?.name ?? it?.url)).toLowerCase(),
        name: String(it?.name ?? it?.originalName ?? it?.media?.name ?? nameFromUrl(it?.url) ?? it?.id ?? ""),
        createdAt: it?.createdAt ?? it?.created_at ?? it?.media?.createdAt,
      }));
      setLibrary(mapped.filter((x) => !!x.url));
      setBanner(
        "Global media library endpoint not found (GET /api/media...). Showing fallback from this playlist details. " +
          "To get a shared library, implement GET /api/media (list/search) and POST /api/media/upload."
      );
      setLoading(false);
      return;
    }

    setLibraryMode("global");
    setLibrary([]);
    setBanner("Cannot load media. Missing endpoints: GET /api/media?search= (global library) and/or GET /api/playlists/:id (playlist details).");
    setLoading(false);
  }

  useEffect(() => {
    if (!open) return;
    loadFolders().catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => loadLibrary(), 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q, playlistId, activeFolder, typeFilter]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addSelectedToPlaylist() {
    if (!playlistId) return;
    if (selected.size === 0) return;

    if (libraryMode !== "global") {
      setBanner(
        "Global library API missing: cannot attach existing media across playlists yet. " +
          "Implement GET /api/media and POST /api/playlists/:id/items { mediaIds } to enable this."
      );
      return;
    }

    setBanner(null);

    const r = await tryFetchJson(`/api/playlists/${encodeURIComponent(playlistId)}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaIds: Array.from(selected) }),
    });

    if (r.ok) {
      onAdded?.();
      onClose();
      return;
    }

    setBanner("Backend missing: POST /api/playlists/:id/items (add from library). Implement it to attach selected media.");
  }

  function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const next: UploadDraft[] = [];
    for (const f of Array.from(files)) {
      next.push({
        id: uid(),
        source: "device",
        file: f,
        name: f.name,
        kind: guessTypeFromName(f.name),
        previewUrl: URL.createObjectURL(f),
      });
    }

    setUploads((prev) => [...prev, ...next]);
    setView("upload");

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeUpload(id: string) {
    setUploads((prev) => {
      const item = prev.find((x) => x.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      if (item?.editedPreviewUrl) URL.revokeObjectURL(item.editedPreviewUrl);
      return prev.filter((x) => x.id !== id);
    });
  }

  function renameUpload(id: string, name: string) {
    setUploads((prev) => prev.map((x) => (x.id === id ? { ...x, name } : x)));
  }

  async function doUploadAll() {
    if (!playlistId) return;
    if (uploads.length === 0) return;

    setUploading(true);
    setUploadPct(0);
    setBanner(null);

    const fd = new FormData();
    const meta: Array<{ name: string; size: number; durationMs?: number }> = [];

    for (const u of uploads) {
      if (u.source !== "device") continue;
      const blob = u.editedBlob ?? u.file;
      if (!blob) continue;

      const fileName = (u.name || (u.file?.name ?? `upload-${u.id}`)).trim() || `upload-${u.id}`;
      fd.append("files", blob, fileName);

      const durationMs = await getVideoDurationFromBlobMs(blob, u.kind);
      if (durationMs) meta.push({ name: fileName, size: blob.size, durationMs });
      else meta.push({ name: fileName, size: blob.size });
    }

    fd.append("meta", JSON.stringify(meta));

    const params = new URLSearchParams();
    // If currently on a real folder id, upload into it. All/Library -> no folderId upload param.
    if (typeof activeFolder === "string" && !activeFolder.startsWith("__")) params.set("folderId", activeFolder);

    try {
      const libResp = await uploadWithProgress(`/api/media/upload?${params.toString()}`, fd, (pct) => setUploadPct(pct));
      const created = (libResp?.items || []).map((m: MediaItem) => ({ ...m, name: m.name || nameFromUrl(m.url) }));
      const ids = created.map((x: any) => x.id).filter(Boolean);

      if (ids.length === 0) {
        setBanner("Upload succeeded but returned no created items. Ensure /api/media/upload returns { items: [...] }.");
        setUploading(false);
        setUploadPct(0);
        return;
      }

      const attach = await tryFetchJson(`/api/playlists/${encodeURIComponent(playlistId)}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaIds: ids }),
      });

      if (!attach.ok) {
        setBanner("Files uploaded to library, but cannot attach to playlist. Implement POST /api/playlists/:id/items.");
        await loadLibrary();
        setUploading(false);
        setUploadPct(0);
        return;
      }

      setUploading(false);
      setUploadPct(0);
      cleanupUploads(uploads);
      setUploads([]);
      onAdded?.();
      onClose();
      return;
    } catch {
      // continue to fallback
    }

    try {
      await uploadWithProgress(`/api/playlists/${encodeURIComponent(playlistId)}/items/upload`, fd, (pct) => setUploadPct(pct));

      setUploading(false);
      setUploadPct(0);
      cleanupUploads(uploads);
      setUploads([]);
      onAdded?.();
      onClose();
      return;
    } catch (e: any) {
      setBanner(
        e?.message ??
          "Upload failed. If you want ScreenCloud behavior, implement POST /api/media/upload. " +
            "For fallback, ensure POST /api/playlists/:id/items/upload accepts multipart with field name 'files'."
      );
      setUploading(false);
      setUploadPct(0);
      return;
    }
  }

  function applyEdit(result: EditedImageResult) {
    if (!editing) return;

    setUploads((prev) =>
      prev.map((x) => {
        if (x.id !== editing.id) return x;

        if (x.editedPreviewUrl) URL.revokeObjectURL(x.editedPreviewUrl);
        const previewUrl = URL.createObjectURL(result.blob);

        return {
          ...x,
          editedBlob: result.blob,
          editedPreviewUrl: previewUrl,
          kind: "image",
        };
      })
    );

    setEditing(null);
  }

  const selectedCount = selected.size;

  const folderIndex = useMemo(() => buildFolderIndex(folders), [folders]);

  // For breadcrumb when browsing a specific folder
  const folderPath = useMemo(() => {
    const id = typeof activeFolder === "string" && !activeFolder.startsWith("__") ? activeFolder : null;
    if (!id) return [];
    const byId = folderIndex.byId;
    const path: FolderNode[] = [];
    let cur = byId.get(id) || null;
    const guard = new Set<string>();
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id);
      path.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) || null : null;
    }
    return path;
  }, [activeFolder, folderIndex]);

  // Folders list for left panel (top-level only, like your screenshot)
  const rootFolders = useMemo(() => folderIndex.roots || [], [folderIndex]);

  // Filter library by search + type
  const filteredLibrary = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (library || []).filter((m) => {
      const name = String(m.name || "").toLowerCase();
      if (qq && !name.includes(qq)) return false;

      if (typeFilter === "all") return true;
      const kind = String(m.type || guessTypeFromName(m.name || nameFromUrl(m.url))).toLowerCase();
      return kind === typeFilter;
    });
  }, [library, q, typeFilter]);

  if (!open) return null;

  return (
    <div className="mp-backdrop" role="dialog" aria-modal="true" aria-label="Media Picker" onMouseDown={onClose}>
      <div className="mp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mp-header">
          <div className="mp-title">
            <div className="mp-title-main">Media Picker</div>
            <div className="mp-title-sub">{view === "upload" ? "Uploading to Library" : ""}</div>
          </div>

          <button className="mp-close" onClick={onClose} aria-label="Close" disabled={uploading}>
            <X size={18} />
          </button>
        </div>

        <div className="mp-body">
          <aside className="mp-nav">
            <button className={`mp-nav-item ${tab === "media" ? "is-active" : ""}`} onClick={() => setTab("media")} disabled={uploading}>
              <span className="mp-nav-ico">▢</span>
              <span>Media</span>
            </button>
            <button className={`mp-nav-item ${tab === "links" ? "is-active" : ""}`} onClick={() => setTab("links")} disabled={uploading}>
              <span className="mp-nav-ico">🔗</span>
              <span>Links</span>
            </button>
            <button className={`mp-nav-item ${tab === "canvas" ? "is-active" : ""}`} onClick={() => setTab("canvas")} disabled={uploading}>
              <span className="mp-nav-ico">✎</span>
              <span>Canvas</span>
            </button>
            <button className={`mp-nav-item ${tab === "apps" ? "is-active" : ""}`} onClick={() => setTab("apps")} disabled={uploading}>
              <span className="mp-nav-ico">▦</span>
              <span>Apps</span>
            </button>
            <button className={`mp-nav-item ${tab === "quickpost" ? "is-active" : ""}`} onClick={() => setTab("quickpost")} disabled={uploading}>
              <span className="mp-nav-ico">✈</span>
              <span>Quick Post</span>
            </button>
          </aside>

          <main className="mp-main">
            <div className="mp-toolbar">
              <div className="mp-search">
                <Search size={16} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Media" disabled={uploading} />
              </div>

              <select
                className="mp-filter"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                disabled={uploading}
                aria-label="Filter type"
                title="Filter type"
              >
                <option value="all">All</option>
                <option value="image">Images</option>
                <option value="video">Videos</option>
              </select>

              <button
                className="mp-btn mp-btn-yellow"
                disabled={uploading}
                onClick={() => {
                  setView("upload");
                  requestAnimationFrame(() => openFilePicker());
                }}
              >
                <UploadIcon size={16} />
                Upload
              </button>

              <input ref={fileInputRef} className="mp-file-hidden" type="file" multiple onChange={(e) => onPickFiles(e.target.files)} />
            </div>

            {banner ? <div className="mp-banner">{banner}</div> : null}

            {view === "library" ? (
              <>
                {/* NEW: folders-left + list-right layout */}
                <div className="mp-library-grid">
                  {/* LEFT FOLDERS */}
                  <div className="mp-folders">
                    <div className="mp-section-title" style={{ padding: "10px 10px 0 10px", margin: 0 }}>
                      Folders
                    </div>

                    <div className="mp-folder-list">
                      <button
                        type="button"
                        className={`mp-folder-row ${activeFolder === "__ALL__" ? "is-active" : ""}`}
                        onClick={() => {
                          setActiveFolder("__ALL__");
                          setFolderId(null);
                        }}
                        disabled={uploading}
                      >
                        <span className="mp-folder-caret" aria-hidden>
                          <ChevronRight size={14} />
                        </span>
                        <Folder size={16} />
                        <span className="mp-folder-name">All</span>
                      </button>

                      <button
                        type="button"
                        className={`mp-folder-row ${activeFolder === "__LIBRARY__" ? "is-active" : ""}`}
                        onClick={() => {
                          setActiveFolder("__LIBRARY__");
                          setFolderId(null);
                        }}
                        disabled={uploading}
                      >
                        <span className="mp-folder-caret" aria-hidden>
                          <ChevronRight size={14} />
                        </span>
                        <Folder size={16} />
                        <span className="mp-folder-name">Library</span>
                      </button>

                      {rootFolders.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={`mp-folder-row ${activeFolder === f.id ? "is-active" : ""}`}
                          onClick={() => {
                            setActiveFolder(f.id);
                            setFolderId(f.id);
                          }}
                          title={f.name}
                          disabled={uploading}
                        >
                          <span className="mp-folder-caret" aria-hidden>
                            <ChevronRight size={14} />
                          </span>
                          <Folder size={16} />
                          <span className="mp-folder-name">{f.name}</span>
                        </button>
                      ))}

                      {!loading && rootFolders.length === 0 ? <div className="mp-empty-folders">No folders.</div> : null}
                    </div>
                  </div>

                  {/* RIGHT LIST */}
                  <div className="mp-library-right">
                    {/* Breadcrumb: show only when inside a real folder */}
                    <div className="mp-section-title mp-section-title-row">
                      <div className="mp-breadcrumb">
                        {typeof activeFolder === "string" && !activeFolder.startsWith("__") ? (
                          <button
                            className="mp-bc-back"
                            onClick={() => {
                              const last = folderPath[folderPath.length - 1];
                              const parent = last?.parentId ?? null;
                              if (parent) {
                                setActiveFolder(parent);
                                setFolderId(parent);
                              } else {
                                setActiveFolder("__LIBRARY__");
                                setFolderId(null);
                              }
                            }}
                            title="Back"
                            aria-label="Back"
                            disabled={uploading}
                          >
                            <ChevronLeft size={16} />
                          </button>
                        ) : null}

                        <span className="mp-bc-root" onClick={() => { setActiveFolder("__LIBRARY__"); setFolderId(null); }} role="button" tabIndex={0}>
                          Library
                        </span>

                        {folderPath.map((f) => (
                          <span
                            key={f.id}
                            className="mp-bc-seg"
                            onClick={() => {
                              setActiveFolder(f.id);
                              setFolderId(f.id);
                            }}
                            role="button"
                            tabIndex={0}
                            title={f.name}
                          >
                            / {f.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mp-table-head">
                      <div className="mp-col-name">NAME</div>
                      <div className="mp-col-kind">KIND</div>
                      <div className="mp-col-sel" />
                    </div>

                    <div className="mp-list">
                      {loading ? (
                        <div className="mp-empty">Loading…</div>
                      ) : filteredLibrary.length === 0 ? (
                        <div className="mp-empty">
                          No media found.
                          <div className="mp-empty-sub">Click “Upload” to add new files.</div>
                        </div>
                      ) : (
                        filteredLibrary.map((m) => {
                          const isSelected = selected.has(m.id);
                          const kind = String(m.type || guessTypeFromName(m.name || nameFromUrl(m.url))).toLowerCase();
                          return (
                            <div key={m.id} className={`mp-row ${isSelected ? "is-selected" : ""}`} onClick={() => toggleSelect(m.id)}>
                              <div className="mp-row-left">
                                <div className="mp-thumb">
                                  {kind === "video" ? <video src={absUrl(m.url)} muted playsInline /> : <img src={absUrl(m.url)} alt="" />}
                                </div>
                                <div className="mp-row-nameblock">
                                  <div className="mp-row-name">{m.name || nameFromUrl(m.url) || m.id}</div>
                                  {m.createdAt ? <div className="mp-row-sub">Uploaded on {new Date(m.createdAt).toLocaleString()}</div> : null}
                                </div>
                              </div>

                              <div className="mp-kind">{kind || "media"}</div>
                              <div className="mp-sel">{isSelected ? <CheckCircle2 size={18} /> : <Circle size={18} />}</div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="mp-footer">
                      <div className="mp-footer-left">
                        <span className="mp-selected-pill">
                          Selected <b>{selectedCount}</b>
                        </span>
                      </div>
                      <div className="mp-footer-right">
                        <button className="mp-btn" onClick={() => setSelected(new Set())} disabled={selectedCount === 0 || uploading}>
                          Deselect All
                        </button>

                        <button
                          className="mp-btn mp-btn-yellow"
                          onClick={addSelectedToPlaylist}
                          disabled={selectedCount === 0 || libraryMode !== "global" || uploading}
                          title={libraryMode !== "global" ? "Requires global library API (/api/media + attach endpoint)" : "Add to playlist"}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mp-section-title">Uploading to Library</div>

                {uploading ? (
                  <div className="mp-uploadbar" role="status" aria-live="polite">
                    <div className="mp-uploadtop">
                      <div className="mp-uploadtitle">Uploading…</div>
                      <div className="mp-uploadpct">{uploadPct}%</div>
                    </div>
                    <div className="mp-uploadtrack">
                      <div className="mp-uploadfill" style={{ width: `${uploadPct}%` }} />
                    </div>
                  </div>
                ) : null}

                <div className="mp-upload-stage">
                  <div className="mp-upload-drop">
                    <div className="mp-upload-drop-title">Select Files to Upload</div>
                    <div className="mp-upload-drop-sub">Drag &amp; drop files here, or use “Upload more”.</div>
                  </div>

                  <div className="mp-upload-list">
                    {uploads.length === 0 ? (
                      <div className="mp-empty">
                        No files selected.
                        <div className="mp-empty-sub">Use “Upload more” to pick files.</div>
                      </div>
                    ) : (
                      uploads.map((u) => {
                        const preview = u.editedPreviewUrl || u.previewUrl || u.url || "";
                        const canEdit = u.kind === "image";
                        const sizeKb = u.file ? Math.round(u.file.size / 1024) : null;

                        return (
                          <div key={u.id} className="mp-up-row">
                            <div className="mp-up-thumb">{u.kind === "video" ? <div className="mp-up-video">VIDEO</div> : <img src={String(preview)} alt="" />}</div>

                            <div className="mp-up-main">
                              <div className="mp-up-name">
                                <input value={u.name} onChange={(e) => renameUpload(u.id, e.target.value)} disabled={uploading} />
                                <Pencil size={14} />
                              </div>
                              <div className="mp-up-sub">{sizeKb != null ? `${sizeKb} KB` : u.source.toUpperCase()}</div>
                            </div>

                            <div className="mp-up-actions">
                              <button className="mp-iconbtn" onClick={() => canEdit && setEditing(u)} disabled={!canEdit || uploading} title="Edit (crop/rotate/circle)">
                                <RotateCw size={16} />
                              </button>
                              <button className="mp-iconbtn mp-iconbtn-danger" onClick={() => removeUpload(u.id)} disabled={uploading} title="Remove">
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="mp-footer">
                  <div className="mp-footer-left">
                    <button className="mp-btn" onClick={() => setView("library")} disabled={uploading}>
                      Back to Library
                    </button>
                  </div>
                  <div className="mp-footer-right">
                    <button className="mp-btn" onClick={openFilePicker} disabled={uploading}>
                      Upload more
                    </button>
                    <button className="mp-btn mp-btn-blue" onClick={doUploadAll} disabled={uploads.length === 0 || uploading}>
                      {uploading ? "Uploading…" : `Upload (${uploads.length})`}
                    </button>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      {editing ? <ImageEditorModal open={!!editing} draft={editing} onClose={() => setEditing(null)} onApply={(r) => applyEdit(r)} /> : null}
    </div>
  );
}
