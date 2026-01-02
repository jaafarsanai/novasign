import React, { ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import "./VirtualScreenPage.css";

type VSState = "PAIR" | "WAITING" | "PLAYING" | "UNKNOWN";

type ServerStateMessage = {
  code?: string;
  state?: VSState | string;
  updatedAt?: number; // backend uses updatedAt
  playlistAssigned?: boolean;
};

type VsPlaylistItem = {
  id: string;
  type: "image" | "video";
  url: string; // can be /media/...
  order: number;
  durationMs?: number;
};

type VsPlaylistMessage = {
  code?: string;
  playlistId?: string | null;
  updatedAt?: number;
  items?: VsPlaylistItem[];
};

function normalizeState(s: unknown): VSState {
  if (typeof s !== "string") return "UNKNOWN";
  const up = s.toUpperCase();
  if (up === "PAIR" || up === "WAITING" || up === "PLAYING") return up as VSState;
  return "UNKNOWN";
}

function normalizeUrl(url: string): string {
  // Backend returns /media/... ; keep same-origin absolute for <img>/<video>
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  return `${window.location.origin}/${url}`;
}

type VirtualSessionResponse = { code: string };

// LocalStorage key written by ScreensPage on delete
const VS_DELETED_KEY = "ns:vs:last_deleted";

// How long we consider a deleted-code marker "fresh"
const VS_DELETED_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function createVirtualSession(): Promise<string> {
  const res = await fetch("/api/screens/virtual-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Failed to create virtual session (${res.status})`);
  }

  const data = (await res.json()) as VirtualSessionResponse;
  return String(data.code || "").trim().toUpperCase();
}

export default function VirtualScreenPage() {
  const { code: rawCode } = useParams();
  const code = (rawCode || "").trim().toUpperCase();
  const location = useLocation();
  const nav = useNavigate();

  const pairUrl = useMemo(() => {
    const origin = window.location.origin;
    const path = location.pathname; // /virtual-screen/<CODE>
    return `${origin}${path}`;
  }, [location.pathname]);

  const [connected, setConnected] = useState(false);
  const [vsState, setVsState] = useState<VSState>(code ? "PAIR" : "WAITING");
  const [playlistAssigned, setPlaylistAssigned] = useState<boolean | null>(null);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);

  // playlist rendering state
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [items, setItems] = useState<VsPlaylistItem[]>([]);
  const [index, setIndex] = useState(0);

  // user-facing banner (non-fatal)
  const [banner, setBanner] = useState<string | null>(null);

  // QR component (supports multiple qrcode.react versions safely)
  const [QrComp, setQrComp] = useState<ComponentType<any> | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const pingTimerRef = useRef<number | null>(null);

  const advanceTimerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  };

  const safeAdvance = () => {
    setIndex((prev) => {
      const n = items.length;
      if (n <= 1) return 0;
      return (prev + 1) % n;
    });
  };

  // If this code was deleted (admin action), rotate to a new code
  const rotateIfDeleted = async (reason: string) => {
    try {
      setBanner(reason);
      const newCode = await createVirtualSession();
      // Replace URL so back button doesn't return to dead code
      nav(`/virtual-screen/${encodeURIComponent(newCode)}`, { replace: true });
    } catch (e: any) {
      // If user is not authenticated, we cannot create a new session here.
      setBanner(
        (e?.message ? String(e.message) : "") ||
          "This virtual screen was deleted. Please relaunch it from the admin dashboard."
      );
    }
  };

  // Load QR component dynamically (avoids TS export mismatches)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mod: any = await import("qrcode.react");
        const Comp = mod?.QRCodeCanvas || mod?.QRCodeSVG || mod?.default || mod;
        if (alive && Comp) setQrComp(() => Comp);
      } catch {
        if (alive) setQrComp(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // On mount: if localStorage says THIS code was deleted recently, rotate immediately.
  useEffect(() => {
    if (!code) return;

    try {
      const raw = localStorage.getItem(VS_DELETED_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { code?: string; at?: number };
      const deletedCode = String(parsed?.code || "").trim().toUpperCase();
      const at = Number(parsed?.at || 0);

      if (deletedCode && deletedCode === code && at && Date.now() - at < VS_DELETED_TTL_MS) {
        rotateIfDeleted("This virtual screen was deleted. Creating a fresh pairing code…");
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Cross-tab: listen to deletion events from admin
  useEffect(() => {
    if (!code) return;

    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== VS_DELETED_KEY) return;
      try {
        const parsed = JSON.parse(ev.newValue || "{}") as { code?: string; at?: number };
        const deletedCode = String(parsed?.code || "").trim().toUpperCase();
        const at = Number(parsed?.at || 0);
        if (!deletedCode || deletedCode !== code) return;
        if (!at || Date.now() - at > VS_DELETED_TTL_MS) return;

        rotateIfDeleted("This virtual screen was deleted. Creating a fresh pairing code…");
      } catch {
        // ignore
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Socket.IO connection (MATCHES BACKEND)
  useEffect(() => {
    if (!code) return;

    // cleanup old
    clearAdvanceTimer();

    if (pingTimerRef.current) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (socketRef.current) {
      try {
        socketRef.current.disconnect();
      } catch {}
      socketRef.current = null;
    }

    const socket = io(`${window.location.origin}/virtual-screen`, {
      path: "/ws",
      transports: ["websocket"],
      query: { code },
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionAttempts: Infinity,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("vs:ping", { code });

      pingTimerRef.current = window.setInterval(() => {
        socket.emit("vs:ping", { code });
      }, 5000);
    });

    socket.on("disconnect", () => {
      setConnected(false);
      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
    });

    socket.on("connect_error", () => {
      // no-op
    });

    socket.on("vs:state", (msg: ServerStateMessage) => {
      if (typeof msg.updatedAt === "number") setLastUpdateAt(msg.updatedAt);
      if (typeof msg.playlistAssigned === "boolean") setPlaylistAssigned(msg.playlistAssigned);
      setVsState(normalizeState(msg.state));
    });

    socket.on("vs:playlist", (msg: VsPlaylistMessage) => {
      if (typeof msg.updatedAt === "number") setLastUpdateAt(msg.updatedAt);
      setPlaylistId((msg.playlistId ?? null) as any);

      const next = Array.isArray(msg.items) ? msg.items.slice() : [];
      next.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setItems(next);

      setIndex((prev) => {
        if (next.length === 0) return 0;
        if (prev < next.length) return prev;
        return 0;
      });
    });

    return () => {
      clearAdvanceTimer();
      if (pingTimerRef.current) {
        window.clearInterval(pingTimerRef.current);
        pingTimerRef.current = null;
      }
      try {
        socket.disconnect();
      } catch {}
      socketRef.current = null;
    };
  }, [code]);

  // Drive playback when in PLAYING and items exist
  const active = items.length > 0 ? items[index % items.length] : null;

  useEffect(() => {
    clearAdvanceTimer();

    if (vsState !== "PLAYING") return;
    if (!active) return;

    if (active.type === "image") {
      const ms = typeof active.durationMs === "number" && active.durationMs > 0 ? active.durationMs : 5000;
      advanceTimerRef.current = window.setTimeout(() => {
        safeAdvance();
      }, ms);
      return;
    }
    // video: advance onEnded
  }, [vsState, active?.id]);

  const onVideoEnded = () => safeAdvance();
  const onVideoError = () => safeAdvance();

  const debugBuild = (import.meta as any)?.env?.VITE_VS_DEBUG_BUILD || "";

  const debugLine = useMemo(() => {
    const parts = [
      debugBuild ? `VS_DEBUG_BUILD=${debugBuild}` : null,
      `VS_STATE=${vsState}`,
      `CONNECTED=${connected ? "Y" : "N"}`,
      playlistId ? `PLAYLIST=${playlistId}` : null,
      items.length ? `ITEMS=${items.length}` : null,
    ].filter(Boolean);

    const extra =
      playlistAssigned === false
        ? "No playlist assigned"
        : playlistAssigned === true
          ? "Playlist assigned"
          : "";

    return `${parts.join(" | ")}\n${extra}`.trim();
  }, [connected, debugBuild, playlistAssigned, vsState, playlistId, items.length]);

  const showPair = vsState === "PAIR";

  return (
    <div className="vs-page">
      <pre className="vs-debug">{debugLine}</pre>

      {banner ? (
        <div
          style={{
            margin: "8px 0 12px",
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(15, 23, 42, 0.06)",
            border: "1px solid rgba(15, 23, 42, 0.10)",
            fontWeight: 700,
          }}
        >
          {banner}
        </div>
      ) : null}

      <div className="vs-stage">
        <div className="vs-stage-inner">
          {showPair ? (
            <>
              <h1 className="vs-title">Pair device</h1>
              <p className="vs-subtitle">
                Log in to your Novasign account. Use <b>Pair screen</b> and enter this code.
              </p>
              <div className="vs-code">{code || "-----"}</div>
            </>
          ) : (
            <>
              {vsState === "PLAYING" && active ? (
                <div style={{ width: "100%", height: "100%", position: "relative" }}>
                  {active.type === "image" ? (
                    <img
                      src={normalizeUrl(active.url)}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        borderRadius: 18,
                      }}
                      onError={() => safeAdvance()}
                    />
                  ) : (
                    <video
                      ref={videoRef}
                      src={normalizeUrl(active.url)}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        borderRadius: 18,
                      }}
                      autoPlay
                      muted
                      playsInline
                      onEnded={onVideoEnded}
                      onError={onVideoError}
                    />
                  )}
                </div>
              ) : (
                <>
                  <h1 className="vs-title">Novasign Virtual Screen</h1>
                  <p className="vs-subtitle">
                    {vsState === "PLAYING" ? "Playing content…" : "Waiting for content from your dashboard..."}
                  </p>
                  {playlistAssigned === false ? (
                    <p className="vs-subtitle" style={{ opacity: 0.9 }}>
                      No playlist assigned
                    </p>
                  ) : null}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="vs-footer">
        <div className="vs-footer-left">
          <div className="vs-logo">N</div>
          <div>
            <p className="vs-footer-title">Novasign Virtual Screen</p>
            <p className="vs-footer-desc">If you close this tab you can relaunch it from the screens section.</p>
          </div>
        </div>

        <div className="vs-footer-right">
          <div className="vs-pair-text">
            <p className="vs-pair-label">Pairing code</p>
            <p className="vs-pair-code">{code || "-----"}</p>
            <div className="vs-qr-hint">Scan to login and pair</div>
          </div>

          <div className="vs-qr-box">
            {QrComp ? <QrComp value={pairUrl} size={86} includeMargin={true} /> : <div style={{ fontSize: 10 }}>QR</div>}
          </div>
        </div>
      </div>

      <div className="vs-bottom-hint">
        Open your admin dashboard, then use <b>Pair screen</b> and enter the code above.
        {lastUpdateAt ? ` (last update: ${new Date(lastUpdateAt).toLocaleString()})` : ""}
      </div>
    </div>
  );
}

