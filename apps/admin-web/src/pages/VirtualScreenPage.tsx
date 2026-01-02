import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";

type MediaItem = {
  id?: string;
  type: "image" | "video";
  url: string;
  duration?: number; // seconds (for images)
};

type PlaylistLike = {
  id?: string;
  name?: string;
  items?: MediaItem[];
};

type VsStatePayload = {
  code: string;
  state: "PAIR" | "WAITING" | "PLAYING" | string;
  screenId?: string;
  updatedAt?: number;

  // optional / legacy-friendly fields
  playlist?: PlaylistLike | null;
  assignedPlaylist?: PlaylistLike | null;
  items?: MediaItem[];
};

const VS_DEBUG_BUILD = "VS_DEBUG_BUILD=2025-12-18_FIX_EVENT_NAMES";

export default function VirtualScreenPage() {
  const { code: rawCode = "" } = useParams<{ code: string }>();
  const code = String(rawCode || "").trim().toUpperCase();

  const [connected, setConnected] = useState(false);
  const [vs, setVs] = useState<VsStatePayload | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const slideTimerRef = useRef<number | null>(null);

  const origin = useMemo(() => window.location.origin, []);

  const items: MediaItem[] = useMemo(() => {
    const p = vs?.playlist ?? vs?.assignedPlaylist ?? null;
    return (vs?.items ?? p?.items ?? []) || [];
  }, [vs]);

  const playlistName = useMemo(() => {
    const p = vs?.playlist ?? vs?.assignedPlaylist ?? null;
    return p?.name ?? null;
  }, [vs]);

  const [idx, setIdx] = useState(0);
  const current = useMemo(() => (items.length ? items[idx % items.length] : null), [items, idx]);

  function clearTimers() {
    if (pingTimerRef.current) window.clearInterval(pingTimerRef.current);
    pingTimerRef.current = null;

    if (slideTimerRef.current) window.clearTimeout(slideTimerRef.current);
    slideTimerRef.current = null;
  }

  // advance slides for images
  useEffect(() => {
    if (!current || current.type === "video") return;

    if (slideTimerRef.current) window.clearTimeout(slideTimerRef.current);
    const ms = (current.duration ?? 8) * 1000;

    slideTimerRef.current = window.setTimeout(() => {
      setIdx((v) => v + 1);
    }, ms);

    return () => {
      if (slideTimerRef.current) window.clearTimeout(slideTimerRef.current);
      slideTimerRef.current = null;
    };
  }, [current, items.length]);

  useEffect(() => {
    clearTimers();

    // invalid code => stay in PAIR screen
    if (!code || code.length !== 6) {
      setConnected(false);
      setVs({ code, state: "PAIR", updatedAt: Date.now() });
      return;
    }

    const s = io(`${origin}/virtual-screen`, {
      path: "/ws",
      transports: ["websocket", "polling"],
      query: { code },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 4000,
      timeout: 8000,
      withCredentials: true,
    });

    socketRef.current = s;

    const onConnect = () => {
      setConnected(true);

      // Immediately request state (covers missed initial emit)
      s.emit("vs:ping", { code });

      // Keep requesting state until UI reflects pairing
      pingTimerRef.current = window.setInterval(() => {
        s.emit("vs:ping", { code });
      }, 1500);
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onState = (payload: VsStatePayload) => {
      // Accept only matching code
      const pcode = String(payload?.code ?? "").trim().toUpperCase();
      if (!pcode || pcode !== code) return;

      // Debug (keep one line, useful in DevTools)
      // eslint-disable-next-line no-console
      console.log("vs:state", payload);

      setVs(payload);
      setIdx(0);
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("vs:state", onState);

    // if your server ever emits explicit error events
    s.on("connect_error", () => setConnected(false));

    return () => {
      clearTimers();
      try {
        s.off("connect", onConnect);
        s.off("disconnect", onDisconnect);
        s.off("vs:state", onState);
        s.disconnect();
      } catch {
        // ignore
      }
      socketRef.current = null;
    };
  }, [code, origin]);

  const uiState = vs?.state ?? "PAIR";
  const debug = `${VS_DEBUG_BUILD} | VS_STATE=${uiState} | CONNECTED=${connected ? "Y" : "N"}`;

  return (
    <div className="virtual-screen-wrapper">
      <div className="vs-marker">{debug}</div>

      <div className="virtual-screen-container">
        <div className="virtual-screen-content-layer">
          {uiState === "PAIR" ? (
            <div className="virtual-screen-pair">
              <div className="virtual-screen-pair-title">Pair device</div>
              <div className="virtual-screen-pair-sub">
                Log in to your Novasign account. Use <b>Pair screen</b> and enter this code.
              </div>
              <div className="virtual-screen-code">{code}</div>
              <div className="virtual-screen-status">{connected ? "Connected" : "Connecting..."}</div>
            </div>
          ) : uiState === "WAITING" ? (
            <div className="virtual-screen-waiting">
              <div className="virtual-screen-waiting-logo">N</div>
              <div className="virtual-screen-waiting-title">Novasign Virtual Screen</div>
              <div className="virtual-screen-waiting-sub">Waiting for content from your dashboard...</div>
              <div className="virtual-screen-waiting-sub2">
                {playlistName ? `Playlist: ${playlistName}` : "No playlist assigned"}
              </div>
            </div>
          ) : current ? (
            current.type === "image" ? (
              <img className="virtual-screen-content-media" src={current.url} alt="" />
            ) : (
              <video
                className="virtual-screen-content-media"
                src={current.url}
                autoPlay
                muted
                playsInline
                onEnded={() => setIdx((v) => v + 1)}
              />
            )
          ) : (
            <div className="virtual-screen-waiting">
              <div className="virtual-screen-waiting-logo">N</div>
              <div className="virtual-screen-waiting-title">Novasign Virtual Screen</div>
              <div className="virtual-screen-waiting-sub">Waiting for content...</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

