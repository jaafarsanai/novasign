import React, { useEffect, useMemo, useState } from "react";
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
  const [items, setItems] = useState<PlaylistDto[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function load() {
    setError(null);
    const res = await fetch("/api/playlists", { credentials: "include" });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const data = (await res.json()) as PlaylistDto[];
    setItems(data);
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

  return (
    <div className="pl-page">
      <div className="pl-header">
        <h1 className="pl-title">Playlists</h1>

        <div className="pl-header-right">
          <div className="pl-search">
            <span className="pl-search-ico" aria-hidden="true">⌕</span>
            <input
              className="pl-search-input"
              placeholder="Search Playlists"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {/* If you already have NewPlaylist flow elsewhere, wire it here.
              This button is styling-only and safe to remove if not needed. */}
          <button type="button" className="pl-btn pl-btn-primary" onClick={() => (window.location.href = "/playlists/new")}>
            New Playlist
          </button>
        </div>
      </div>

      {error && <pre className="pl-error">{error}</pre>}

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

            <div className="pl-row-right">
              <button type="button" className="pl-btn pl-btn-ghost" onClick={() => (window.location.href = `/playlists/${encodeURIComponent(p.id)}`)}>
                Open
              </button>
            </div>
          </div>
        ))}
      </div>

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
    </div>
  );
}

