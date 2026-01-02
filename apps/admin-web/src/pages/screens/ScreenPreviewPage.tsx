import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";

type PreviewItem = {
  id: string;
  type: "image" | "video";
  url: string;
  order: number;
  durationMs?: number;
};

type ScreenSnapshot = {
  screen: {
    id: string;
    name: string | null;
    pairingCode: string;
    pairedAt: string | null;
    lastSeenAt: string | null;
    assignedPlaylistId: string | null;
    assignedPlaylistName: string | null;
  };
  playlist: {
    id: string | null;
    name: string | null;
    items: PreviewItem[];
  };
  nowPlaying: {
    itemId: string | null;
    startedAt: number | null;
    positionMs: number | null;
  };
  updatedAt: number;
};

function normalizeUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  return `${window.location.origin}/${url}`;
}

export default function ScreenPreviewPage() {
  const { id } = useParams();
  const screenId = String(id || "");

  const [connected, setConnected] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [snap, setSnap] = useState<ScreenSnapshot | null>(null);
  const items = useMemo(() => snap?.playlist?.items ?? [], [snap]);

  const [localIndex, setLocalIndex] = useState(0);
  const timerRef = useRef<number | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const active = items.length ? items[localIndex % items.length] : null;

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const next = () => {
    setLocalIndex((prev) => (items.length ? (prev + 1) % items.length : 0));
  };

  // Connect to /screens namespace
  useEffect(() => {
    if (!screenId) return;

    setErr(null);
    clearTimer();

    if (socketRef.current) {
      try {
        socketRef.current.disconnect();
      } catch {}
      socketRef.current = null;
    }

    const s = io(`${window.location.origin}/screens`, {
      path: "/ws",
      transports: ["websocket"],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = s;

    s.on("connect", () => {
      setConnected(true);
      s.emit("screen:subscribe", { screenId });
    });

    s.on("disconnect", () => {
      setConnected(false);
    });

    s.on("connect_error", (e: any) => {
      setErr(e?.message ?? "Socket connect error");
    });

    s.on("screen:snapshot", (payload: ScreenSnapshot) => {
      setSnap(payload);

      // If server provided nowPlaying.itemId, align local index to it.
      const itemId = payload?.nowPlaying?.itemId;
      if (itemId && Array.isArray(payload.playlist?.items)) {
        const idx = payload.playlist.items.findIndex((x) => x.id === itemId);
        if (idx >= 0) setLocalIndex(idx);
      }
    });

    s.on("screen:playlist", (payload: { screenId: string; playlistId: string | null; items: PreviewItem[] }) => {
      setSnap((prev) => {
        if (!prev) return prev;
        if (prev.screen.id !== payload.screenId) return prev;
        const nextSnap: ScreenSnapshot = {
          ...prev,
          playlist: {
            ...prev.playlist,
            id: payload.playlistId,
            items: Array.isArray(payload.items) ? payload.items.slice() : [],
          },
          updatedAt: Date.now(),
        };
        return nextSnap;
      });

      // keep index in range
      setLocalIndex((prev) => {
        const n = Array.isArray(payload.items) ? payload.items.length : 0;
        if (n <= 0) return 0;
        return prev < n ? prev : 0;
      });
    });

    s.on("screen:nowPlaying", (payload: { screenId: string; itemId: string | null; startedAt?: number | null }) => {
      setSnap((prev) => {
        if (!prev) return prev;
        if (prev.screen.id !== payload.screenId) return prev;
        return {
          ...prev,
          nowPlaying: {
            itemId: payload.itemId ?? null,
            startedAt: typeof payload.startedAt === "number" ? payload.startedAt : prev.nowPlaying.startedAt,
            positionMs: prev.nowPlaying.positionMs,
          },
          updatedAt: Date.now(),
        };
      });

      // Align index to server-provided item
      if (payload.itemId) {
        const idx = items.findIndex((x) => x.id === payload.itemId);
        if (idx >= 0) setLocalIndex(idx);
      }
    });

    return () => {
      clearTimer();
      try {
        s.disconnect();
      } catch {}
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenId]);

  // local playback (fallback): even if nowPlaying is missing, you still see playback.
  useEffect(() => {
    clearTimer();
    if (!active) return;

    if (active.type === "image") {
      const ms = typeof active.durationMs === "number" && active.durationMs > 0 ? active.durationMs : 5000;
      timerRef.current = window.setTimeout(() => next(), ms);
    }
    return () => clearTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Screen Preview</h2>
          <div style={{ opacity: 0.75, marginTop: 6 }}>
            Connected: <b>{connected ? "YES" : "NO"}</b>
          </div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            Screen: <b>{snap?.screen?.name ?? "—"}</b> • Code: <b>{snap?.screen?.pairingCode ?? "—"}</b>
          </div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            Playlist: <b>{snap?.screen?.assignedPlaylistName ?? "—"}</b> • Items: <b>{items.length}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => socketRef.current?.emit("screen:subscribe", { screenId })}>
            Refresh snapshot
          </button>
          <button type="button" onClick={() => next()} disabled={!items.length}>
            Next
          </button>
        </div>
      </div>

      {err ? (
        <pre style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "#fee2e2" }}>{err}</pre>
      ) : null}

      <div
        style={{
          marginTop: 16,
          width: "100%",
          maxWidth: 1100,
          aspectRatio: "16 / 9",
          borderRadius: 18,
          background: "#0b1220",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {!active ? (
          <div style={{ color: "white", opacity: 0.8 }}>No content</div>
        ) : active.type === "image" ? (
          <img
            src={normalizeUrl(active.url)}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            onError={() => next()}
          />
        ) : (
          <video
            src={normalizeUrl(active.url)}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            autoPlay
            muted
            playsInline
            onEnded={() => next()}
            onError={() => next()}
          />
        )}
      </div>

      <div style={{ marginTop: 10, opacity: 0.75 }}>
        This preview will sync to <b>screen:nowPlaying</b> when available. Otherwise it plays the assigned playlist locally.
      </div>
    </div>
  );
}

