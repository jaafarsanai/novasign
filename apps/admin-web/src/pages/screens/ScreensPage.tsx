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
  const fallback = s.isVirtual ? "Virtual Screen" : "Screen";
  return {
    id: s.id,
    name: (s.name ?? fallback).trim() || fallback,
    pairingCode: s.pairingCode,
    type: s.isVirtual ? "VIRTUAL" : "DEVICE",
    lastSeenAt: s.lastSeenAt,
    assignedPlaylistId: (s as any).assignedPlaylistId ?? null,
    assignedPlaylistName: (s as any).assignedPlaylistName ?? null,
  };
}

export default function ScreensPage() {
  // rows === null means "loading" (so we can avoid flashing the header)
  const [rows, setRows] = useState<UiRow[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      setRows([]); // stop loading so UI can render an error state
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
        if (!mounted) return;
      }
    })();

    // Realtime: /screens namespace
    const s = io("/screens", {
      path: "/ws",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    sockRef.current = s;

    s.on("screens:snapshot", (evt: ScreenSnapshotEvent) => {
      setRows((prev) => {
        const base = prev ?? [];
        const next = base.slice();
        const idx = next.findIndex((x) => x.id === evt.id);

        const fallback = evt.isVirtual ? "Virtual Screen" : "Screen";
        const mapped: UiRow = {
          id: evt.id,
          name: (evt.name ?? fallback).trim() || fallback,
          pairingCode: evt.pairingCode,
          type: evt.isVirtual ? "VIRTUAL" : "DEVICE",
          lastSeenAt: evt.lastSeenAt,
          assignedPlaylistId: evt.assignedPlaylistId,
          assignedPlaylistName: evt.assignedPlaylistName,
        };

        if (idx === -1) {
          next.unshift(mapped);
          return next;
        }

        next[idx] = { ...next[idx], ...mapped };
        return next;
      });
    });

    s.on("screens:deleted", (evt: ScreenDeletedEvent) => {
      setRows((prev) => (prev ?? []).filter((x) => x.id !== evt.id));
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

  const loading = rows === null;
  const hasScreens = !loading && (rows?.length ?? 0) > 0;
  const showEmpty = !loading && (rows?.length ?? 0) === 0;

  const filtered = useMemo(() => {
    const base = rows ?? [];
    const qq = q.trim().toLowerCase();
    if (!qq) return base;
    return base.filter(
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

    const data = (await res.json()) as { id: string; pairingCode: string; code?: string };
    window.open(`/virtual-screen/${encodeURIComponent(data.id)}`, "_blank", "noopener,noreferrer");
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
    setRows((prev) => (prev ?? []).filter((x) => x.id !== id));
  }

  function openAssign(r: UiRow) {
    setAssignScreen(r);
    setAssignOpen(true);
    setMenuOpenId(null);
  }

  async function openPreview(r: UiRow) {
    setError(null);

    const res = await fetch("/api/screens/virtual-sessions/for-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code: r.pairingCode }),
    });

    if (!res.ok) {
      setError(await res.text());
      setMenuOpenId(null);
      return;
    }

    const data = (await res.json()) as { id: string; pairingCode: string };
    window.open(`/virtual-screen/${encodeURIComponent(data.id)}`, "_blank", "noopener,noreferrer");
    setMenuOpenId(null);
  }

  return (
    <div className={`ns2-screens-page ${showEmpty ? "ns2-screens-page--empty" : ""}`}>
      {/* Header ONLY when there are screens */}
      {hasScreens && (
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
      )}

      {error && <pre className="ns2-error ns2-error-inline">{error}</pre>}

      {loading ? (
        <div className="ns2-skeleton">
          <div className="ns2-skeleton-row" />
          <div className="ns2-skeleton-row" />
          <div className="ns2-skeleton-row" />
        </div>
      ) : showEmpty ? (
        <div className="ns2-empty-center">
          <div className="screens-empty">
            <div className="screens-empty-title">Okay, let's get a screen up and running</div>

            <div className="screens-empty-cards">
              <div className="screens-empty-card screens-empty-card--dark">
                <div className="screens-empty-card-body">
                  <div className="screens-empty-card-h">I know what I'm doing</div>
                  <div className="screens-empty-card-p">
                    I have a screen displaying a pairing code
                    <br />
                    and I'm ready to connect
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary screens-empty-card-cta"
                  onClick={() => {
                    setPairError(null);
                    setPairOpen(true);
                  }}
                >
                  Pair your screen now
                </button>
              </div>

              <div className="screens-empty-card screens-empty-card--purple">
                <div className="screens-empty-card-top">
                  <div className="screens-empty-card-body">
                    <div className="screens-empty-card-h">I just want to experiment with it</div>
                    <div className="screens-empty-card-p">
                      No screen, no problem?
                      <br />
                      Launch a virtual screen to pair
                      <br />
                      and display content on.
                    </div>
                  </div>

                  <img
                    className="screens-empty-card-illus"
                    src="/assets/icons/screenlayout.svg"
                    alt=""
                    draggable={false}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-ghost screens-empty-card-cta screens-empty-card-cta--pill"
                  onClick={launchVirtualScreen}
                >
                  Launch a Virtual Screen
                </button>
              </div>
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
                          <span
                            className={"ns2-thumb " + (r.type === "VIRTUAL" ? "ns2-thumb-virtual" : "ns2-thumb-device")}
                            aria-hidden
                          />
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
                              <button type="button" className="ns2-menu-item" onClick={() => void openPreview(r)}>
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
            onPageSizeChange={(n: number) => setPageSize(n)}
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

