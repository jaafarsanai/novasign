import React, { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import PairScreenModal from "./PairScreenModal";
import AssignPlaylistModal from "./AssignPlaylistModal";
import Pagination from "../../ui/Pagination";
import "./ScreensPage.css";

type ApiScreenRow = {
  id: string;
  name: string | null;
  pairingCode: string;
  pairedAt: string | null;
  lastSeenAt: string | null;
  isVirtual: boolean;
  assignedPlaylistId?: string | null;
  assignedPlaylistName?: string | null;
};

type UiRow = {
  id: string;
  name: string;
  pairingCode: string;
  type: "VIRTUAL" | "DEVICE";
  lastSeenAt: string | null;
  assignedPlaylistId: string | null;
  assignedPlaylistName: string | null;
};

type ScreenSnapshotEvent = {
  id: string;
  name: string | null;
  pairingCode: string;
  pairedAt: string | null;
  lastSeenAt: string | null;
  isVirtual: boolean;
  assignedPlaylistId: string | null;
  assignedPlaylistName: string | null;
};

type ScreenDeletedEvent = { id: string };

function formatTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function isOnline(lastSeenAt: string | null, nowMs: number, windowMs = 30_000) {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t < windowMs;
}

function mapApiToUi(s: ApiScreenRow): UiRow {
  return {
    id: s.id,
    name:
      (s.name ?? (s.isVirtual ? "Virtual Screen" : "Screen")).trim() ||
      (s.isVirtual ? "Virtual Screen" : "Screen"),
    pairingCode: s.pairingCode,
    type: s.isVirtual ? "VIRTUAL" : "DEVICE",
    lastSeenAt: s.lastSeenAt,
    assignedPlaylistId: (s as any).assignedPlaylistId ?? null,
    assignedPlaylistName: (s as any).assignedPlaylistName ?? null,
  };
}

export default function ScreensPage() {
  const [rows, setRows] = useState<UiRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  // UI-only tick so ONLINE/OFFLINE updates without polling backend
  const [nowTick, setNowTick] = useState(() => Date.now());

  const [pairOpen, setPairOpen] = useState(false);
  const [pairSubmitting, setPairSubmitting] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignScreen, setAssignScreen] = useState<UiRow | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const sockRef = useRef<Socket | null>(null);

  async function load() {
    setError(null);
    const res = await fetch("/api/screens", { credentials: "include" });
    if (!res.ok) {
      setError(await res.text());
      return;
    }

    const data = (await res.json()) as ApiScreenRow[];
    setRows(data.map(mapApiToUi));
  }

  // Initial load + realtime socket
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await load();
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // Realtime: /screens namespace
    const s = io("/screens", {
      path: "/ws",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    sockRef.current = s;

    s.on("connect", () => {
      // optional: could emit a subscribe event if you want per-tenant rooms later
      // s.emit("screens:subscribe", {});
    });

    s.on("screens:snapshot", (evt: ScreenSnapshotEvent) => {
      setRows((prev) => {
        const next = prev.slice();
        const idx = next.findIndex((x) => x.id === evt.id);
        const mapped: UiRow = {
          id: evt.id,
          name:
            (evt.name ?? (evt.isVirtual ? "Virtual Screen" : "Screen")).trim() ||
            (evt.isVirtual ? "Virtual Screen" : "Screen"),
          pairingCode: evt.pairingCode,
          type: evt.isVirtual ? "VIRTUAL" : "DEVICE",
          lastSeenAt: evt.lastSeenAt,
          assignedPlaylistId: evt.assignedPlaylistId,
          assignedPlaylistName: evt.assignedPlaylistName,
        };

        if (idx === -1) {
          // Insert new row (rare; only when something is created/paired)
          next.unshift(mapped);
          return next;
        }

        next[idx] = { ...next[idx], ...mapped };
        return next;
      });
    });

    s.on("screens:deleted", (evt: ScreenDeletedEvent) => {
      setRows((prev) => prev.filter((x) => x.id !== evt.id));
    });

    s.on("disconnect", () => {
      // no-op
    });

    return () => {
      mounted = false;
      s.disconnect();
      sockRef.current = null;
    };
  }, []);

  // UI tick only (no backend polling)
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Reset pagination when query changes
  useEffect(() => {
    setPage(1);
  }, [q, pageSize]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(qq) ||
        r.pairingCode.toLowerCase().includes(qq) ||
        (r.assignedPlaylistName ?? "").toLowerCase().includes(qq)
    );
  }, [rows, q]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  async function launchVirtualScreen() {
    setError(null);

    const res = await fetch("/api/screens/virtual-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      setError(await res.text());
      return;
    }

    const data = (await res.json()) as { code: string };
    window.open(`/virtual-screen/${encodeURIComponent(data.code)}`, "_blank", "noopener,noreferrer");
    // Do NOT call load() here; realtime will update when/if it becomes paired/DB-backed.
  }

  async function pairScreen(code: string) {
    setPairSubmitting(true);
    setPairError(null);
    setError(null);

    try {
      const res = await fetch("/api/screens/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        setPairError(await res.text());
        return;
      }

      setPairOpen(false);
      // optional: load() for immediate refresh, but realtime event should arrive anyway
      await load();
    } finally {
      setPairSubmitting(false);
    }
  }

  async function deleteScreen(id: string) {
    setError(null);
    const res = await fetch(`/api/screens/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!res.ok) {
      setError(await res.text());
      return;
    }

    setMenuOpenId(null);
    // realtime will also remove, but this keeps UX instant
    setRows((prev) => prev.filter((x) => x.id !== id));
  }

  function openAssign(r: UiRow) {
    setAssignScreen(r);
    setAssignOpen(true);
    setMenuOpenId(null);
  }

  function openPreview(r: UiRow) {
    window.open(`/virtual-screen/${encodeURIComponent(r.pairingCode)}`, "_blank", "noopener,noreferrer");
    setMenuOpenId(null);
    // no load() needed; preview ping will trigger realtime snapshot
  }

  const showEmpty = !loading && total === 0;

  return (
    <div className="ns2-screens-page">
      <div className="ns2-screens-header">
        <div className="ns2-screens-title">
          <h1>Screens</h1>
          <p>Manage your screens, pairing codes, and assigned playlists.</p>
        </div>

        <div className="ns2-screens-actions">
          <div className="ns2-searchwrap">
            <span className="ns2-searchicon" aria-hidden />
            <input
              className="ns2-screens-search"
              placeholder="Search Screens"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="ns2-linkbtn"
            onClick={() => {
              setPairError(null);
              setPairOpen(true);
            }}
          >
            Pair screen
          </button>

          <button type="button" className="ns2-primarybtn" onClick={launchVirtualScreen}>
            Launch virtual screen
          </button>
        </div>
      </div>

      {error && <pre className="ns2-error ns2-error-inline">{error}</pre>}

      {loading ? (
        <div className="ns2-skeleton">
          <div className="ns2-skeleton-row" />
          <div className="ns2-skeleton-row" />
          <div className="ns2-skeleton-row" />
        </div>
      ) : showEmpty ? (
        <div className="ns2-empty-wrap">
          <div className="ns2-empty-bg" />
          <div className="ns2-empty-inner">
            <div className="ns2-empty-head">You don’t have any screens yet</div>

            <div className="ns2-empty-grid">
              <div className="ns2-empty-card dark">
                <div className="ns2-empty-card-inner">
                  <div className="ns2-empty-card-title">Pair a physical screen</div>
                  <div className="ns2-empty-card-sub">
                    Open your device, display the pairing code, then use <b>Pair screen</b> here.
                  </div>
                  <button type="button" className="ns2-cta-btn yellow" onClick={() => setPairOpen(true)}>
                    Pair screen
                  </button>
                </div>
              </div>

              <div className="ns2-empty-card purple">
                <div className="ns2-empty-card-inner">
                  <div className="ns2-empty-purple-row">
                    <div>
                      <div className="ns2-empty-card-title">Try a virtual screen</div>
                      <div className="ns2-empty-card-sub">
                        Launch a virtual screen in a new tab and use it as a test device for playlists.
                      </div>
                      <button type="button" className="ns2-cta-btn white" onClick={launchVirtualScreen}>
                        Launch virtual screen
                      </button>
                    </div>
                    <div className="ns2-purple-illus" />
                  </div>
                </div>
              </div>
            </div>

            <div className="ns2-empty-help">
              Tip: After pairing, use <b>Set content</b> to assign a playlist.
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="ns2-table-wrap">
            <table className="ns2-table">
              <thead>
                <tr>
                  <th>Screen</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Playlist</th>
                  <th>Last seen</th>
                  <th className="ns2-th-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {paged.map((r) => {
                  const online = isOnline(r.lastSeenAt, nowTick, 30_000);
                  return (
                    <tr key={r.id}>
                      <td className="ns2-td-strong">
                        <div className="ns2-rowtitle">
                          
                          <span className={ "ns2-thumb " + (r.type === "VIRTUAL" ? "ns2-thumb-virtual" : "ns2-thumb-device") }  aria-hidden/>

			<span>{r.name}</span>
                        </div>
                      </td>
                      <td>{r.type}</td>
                      <td>
                        {online ? (
                          <span className="ns2-badge ns2-badge-live">Live</span>
                        ) : (
                          <span className="ns2-badge ns2-badge-off">Offline</span>
                        )}
                      </td>
                      <td className="ns2-muted">{r.assignedPlaylistName ?? "—"}</td>
                      <td className="ns2-muted">{formatTime(r.lastSeenAt)}</td>

                      <td className="ns2-td-right">
                        <div className="ns2-menu-root">
                          <button
                            type="button"
                            className="ns2-menu-btn"
                            onClick={() => setMenuOpenId((prev) => (prev === r.id ? null : r.id))}
                          >
                            ⋯
                          </button>

                          {menuOpenId === r.id && (
                            <div className="ns2-menu">
                              <button type="button" className="ns2-menu-item" onClick={() => openPreview(r)}>
                                Preview
                              </button>

                              <button type="button" className="ns2-menu-item" onClick={() => openAssign(r)}>
                                Set content
                              </button>

                              <button type="button" className="ns2-menu-item" onClick={() => load()}>
                                Refresh
                              </button>

                              <button
                                type="button"
                                className="ns2-menu-item ns2-menu-danger"
                                onClick={() => deleteScreen(r.id)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={safePage}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(n) => setPageSize(n)}
            pageSizeOptions={[10, 25, 50]}
          />
        </>
      )}

      <PairScreenModal
        open={pairOpen}
        onClose={() => setPairOpen(false)}
        onSubmit={pairScreen}
        isSubmitting={pairSubmitting}
        error={pairError}
      />

      <AssignPlaylistModal
        open={assignOpen}
        screen={assignScreen}
        onClose={() => setAssignOpen(false)}
        onSaved={async () => {
          setAssignOpen(false);
          setAssignScreen(null);
          await load();
        }}
      />
    </div>
  );
}

