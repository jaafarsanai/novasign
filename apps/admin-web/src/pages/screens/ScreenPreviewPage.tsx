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
  id: string;
  name: string | null;
  runtimeKey: string;
  pairedAt: string | null;
  lastSeenAt: string | null;
  assignedPlaylistId: string | null;
  assignedPlaylistName: string | null;
  assignedContentType: "PLAYLIST" | "CHANNEL" | "MEDIA" | null;
  assignedContentId: string | null;
  assignedContentName: string | null;
  virtualSessionId: string | null;
  activePairingCode: string | null;
  orientation: string;
  status: string;
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
  const [items, setItems] = useState<PreviewItem[]>([]);

  const [localIndex, setLocalIndex] = useState(0);
  const timerRef = useRef<number | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const active = useMemo(
    () => (items.length ? items[localIndex % items.length] : null),
    [items, localIndex],
  );

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const next = () => {
    setLocalIndex((prev) => (items.length ? (prev + 1) % items.length : 0));
  };

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
    });

    s.on("disconnect", () => {
      setConnected(false);
    });

    s.on("connect_error", (e: any) => {
      setErr(e?.message ?? "Socket connect error");
    });

    s.on("screens:snapshot", (payload: ScreenSnapshot) => {
      if (!payload || payload.id !== screenId) return;
      setSnap(payload);
    });

    s.on("screens:deleted", (payload: { id: string }) => {
      if (payload?.id === screenId) {
        setErr("Screen deleted");
        setSnap(null);
        setItems([]);
      }
    });

    return () => {
      clearTimer();
      try {
        s.disconnect();
      } catch {}
      socketRef.current = null;
    };
  }, [screenId]);

  useEffect(() => {
    clearTimer();
    if (!active) return;

    if (active.type === "image") {
      const ms = typeof active.durationMs === "number" && active.durationMs > 0 ? active.durationMs : 5000;
      timerRef.current = window.setTimeout(() => next(), ms);
    }

    return () => clearTimer();
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
            Screen: <b>{snap?.name ?? "—"}</b> • Status: <b>{snap?.status ?? "—"}</b>
          </div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            Runtime Key: <b>{snap?.runtimeKey ?? "—"}</b>
          </div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            Active Pairing Code: <b>{snap?.activePairingCode ?? "—"}</b>
          </div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>
            Assigned Content: <b>{snap?.assignedContentName ?? "—"}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => window.location.reload()}>
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
          <div style={{ color: "white", opacity: 0.8 }}>No content preview loaded</div>
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
    </div>
  );
}