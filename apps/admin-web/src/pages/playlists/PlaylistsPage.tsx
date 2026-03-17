import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import NewPlaylistModal from "./NewPlaylistModal";
import { Modal } from "../../ui/Modal";
import "./PlaylistsPage.css";

type PlaylistDto = {
  id: string;
  name: string;
  updatedAt: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function PaginationBar({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = clamp(page, 1, totalPages);

  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  return (
    <div className="pl-pager">
      <div className="pl-pager-left">
        <span className="pl-pager-count">
          Showing <b>{start}</b>–<b>{end}</b> of <b>{total}</b>
        </span>

        <select
          className="pl-pager-size"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          <option value={5}>5 / page</option>
          <option value={10}>10 / page</option>
          <option value={20}>20 / page</option>
          <option value={50}>50 / page</option>
        </select>
      </div>

      <div className="pl-pager-right">
        <button
          type="button"
          className="pl-pager-btn"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          Prev
        </button>
        <button
          type="button"
          className="pl-pager-btn"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function PlaylistsPage() {
  const navigate = useNavigate();

  const [items, setItems] = useState<PlaylistDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [newOpen, setNewOpen] = useState(false);

  const [dupBusyId, setDupBusyId] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlaylistDto | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function onCreated(id: string) {
    setNewOpen(false);
    navigate(`/playlists/${encodeURIComponent(id)}/edit`);
  }

  async function load() {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/playlists", { credentials: "include" });
      if (!res.ok) {
        setError(await res.text());
        setItems([]);
        return;
      }

      const data = (await res.json()) as PlaylistDto[];
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return items;
    return items.filter((p) => p.name.toLowerCase().includes(qq));
  }, [items, q]);

  useEffect(() => {
    setPage(1);
  }, [q, pageSize]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = clamp(page, 1, totalPages);

  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const showEmptyState = !loading && items.length === 0 && !q.trim();
  const showNoSearchResults = !loading && items.length > 0 && filtered.length === 0;
  const shouldShowPager = !loading && items.length > 0;

  async function duplicatePlaylist(id: string) {
    setError(null);
    setDupBusyId(id);

    try {
      const res = await fetch(`/api/playlists/${encodeURIComponent(id)}/duplicate`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        setError(await res.text());
        return;
      }

      await load();
      setPage(1);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setDupBusyId(null);
    }
  }

  function requestDelete(p: PlaylistDto) {
    setError(null);
    setDeleteTarget(p);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/playlists/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        setError(await res.text());
        return;
      }

      setDeleteOpen(false);
      setDeleteTarget(null);

      await load();
      const newTotalPages = Math.max(1, Math.ceil((total - 1) / pageSize));
      setPage((p) => Math.min(p, newTotalPages));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="pl-page">
      <div className="pl-header-card">
        <div className="pl-header">
          <h1 className="pl-title">Playlists</h1>

          <div className="pl-header-right">
            <div className="pl-search">
              <span className="pl-search-ico" aria-hidden="true">
                ⌕
              </span>
              <input
                className="pl-search-input"
                placeholder="Search Playlists"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <button type="button" className="pl-btn pl-btn-primary" onClick={() => setNewOpen(true)}>
              New Playlist
            </button>
          </div>
        </div>
      </div>

      {error && <pre className="pl-error">{error}</pre>}

      {loading ? (
        <div className="pl-loading-wrap">
          <div className="pl-loading-card">
            <div className="pl-skel pl-skel-hero" />
            <div className="pl-skel pl-skel-title" />
            <div className="pl-skel pl-skel-text" />
            <div className="pl-skel pl-skel-text pl-skel-text-short" />
            <div className="pl-skel pl-skel-btn" />
          </div>
        </div>
      ) : showEmptyState ? (
        <div className="pl-empty-wrap">
          <div className="pl-empty-card">
            <img
              className="pl-empty-illus"
              src="/assets/icons/emptyplaylist.svg"
              alt=""
              draggable={false}
            />

            <h2 className="pl-empty-title">Let's get organized</h2>

            <p className="pl-empty-text">
              Playlists help you organize the order of the content that you want to show.
              It&apos;s as easy as drag-and-drop. Fill your playlist with your uploaded media,
              then add your playlist to your channel.
            </p>

            <button
              type="button"
              className="pl-btn pl-btn-empty"
              onClick={() => setNewOpen(true)}
            >
              Create New Playlist
            </button>
          </div>
        </div>
      ) : showNoSearchResults ? (
        <div className="pl-empty-wrap">
          <div className="pl-empty-card pl-empty-card--compact">
            <h2 className="pl-empty-title">No playlists found</h2>
            <p className="pl-empty-text">
              Try a different search term or create a new playlist.
            </p>
            <button
              type="button"
              className="pl-btn pl-btn-empty"
              onClick={() => setNewOpen(true)}
            >
              Create New Playlist
            </button>
          </div>
        </div>
      ) : (
        <div className="pl-list-shell">
          <div className="pl-list">
            {paged.map((p) => (
              <div key={p.id} className="pl-row">
                <div className="pl-row-left">
                  <div className="pl-icon pl-icon-playlist" aria-hidden="true">
                    <span />
                  </div>

                  <div>
                    <div className="pl-name">{p.name}</div>
                    <div className="pl-sub">Updated {formatTime(p.updatedAt)}</div>
                  </div>
                </div>

                <div className="pl-row-right pl-row-actions">
                  <button
                    type="button"
                    className="pl-iconbtn"
                    onClick={() => duplicatePlaylist(p.id)}
                    disabled={dupBusyId === p.id}
                    aria-label="Duplicate playlist"
                    title="Duplicate"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8 7a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V7zm2 0v11h9V7h-9zM5 4a2 2 0 0 1 2-2h9v2H7v11H5V4z" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="pl-iconbtn pl-iconbtn-danger"
                    onClick={() => requestDelete(p)}
                    aria-label="Delete playlist"
                    title="Delete"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v10h-2V9zm4 0h2v10h-2V9zM7 9h2v10H7V9z" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    className="pl-iconbtn"
                    onClick={() => navigate(`/playlists/${encodeURIComponent(p.id)}`)}
                    aria-label="Open playlist"
                    title="Open"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {shouldShowPager && (
        <PaginationBar
          total={total}
          page={safePage}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p)}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      )}

      <NewPlaylistModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={onCreated} />

      <Modal
        open={deleteOpen}
        title="Delete playlist"
        width={520}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
      >
        <div className="pl-del-body">
          <div className="pl-del-title">
            {deleteTarget ? `Delete "${deleteTarget.name}"?` : "Delete this playlist?"}
          </div>

          <div className="pl-del-sub">
            This action cannot be undone. Screens assigned to this playlist may lose their assigned content.
          </div>

          <div className="pl-del-actions">
            <button
              type="button"
              className="pl-btn"
              disabled={deleteBusy}
              onClick={() => {
                setDeleteOpen(false);
                setDeleteTarget(null);
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              className="pl-btn pl-btn-danger"
              disabled={deleteBusy}
              onClick={confirmDelete}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}