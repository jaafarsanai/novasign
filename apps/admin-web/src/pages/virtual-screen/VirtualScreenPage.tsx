// apps/admin-web/src/pages/virtual-screen/VirtualScreenPage.tsx
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { io, Socket } from "socket.io-client";
import "./VirtualScreenPage.css";

type Params = { code?: string };

const DESIGN_W = 1920;
const DESIGN_H = 1080;

type VSState = "PAIR" | "WAITING" | "PLAYING" | "UNKNOWN";

type VsStatePayload = {
  code: string;
  state: VSState;
  updatedAt: number;
  playlistAssigned: boolean;
  exists: boolean;
  screenId: string | null;
  isVirtual: boolean;
};

type VsPlaylistItem = {
  id: string;
  type: "image" | "video";
  url: string;
  order: number;
  durationMs?: number;
};

type VsPlaylistPayload = {
  code: string;
  playlistId: string | null;
  updatedAt: number;
  items: VsPlaylistItem[];
};

function openKey(code: string) {
  return `ns2:vs-open:${code}`;
}

export default function VirtualScreenPage() {
  const params = useParams(); // don't type it narrowly
  const sessionId = useMemo(() => {
    const anyParams = params as Record<string, string | undefined>;
    return String(anyParams.code ?? anyParams.id ?? anyParams.sessionId ?? "").trim();
  }, [params]);

  const qrValue = useMemo(() => {
    try {
      return window.location.href;
    } catch {
      return "";
    }
  }, []);

  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const calc = () => {
      const vv = window.visualViewport;
      const vw = vv?.width ?? window.innerWidth;
      const vh = vv?.height ?? window.innerHeight;
      const s = Math.max(vw / DESIGN_W, vh / DESIGN_H);
      setScale(Number.isFinite(s) && s > 0 ? s : 1);
    };

    calc();
    window.addEventListener("resize", calc);
    window.visualViewport?.addEventListener("resize", calc);
    window.visualViewport?.addEventListener("scroll", calc);

    return () => {
      window.removeEventListener("resize", calc);
      window.visualViewport?.removeEventListener("resize", calc);
      window.visualViewport?.removeEventListener("scroll", calc);
    };
  }, []);

  const [pairingCode, setPairingCode] = useState<string>("");
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [vsState, setVsState] = useState<VsStatePayload | null>(null);
  const [vsPlaylist, setVsPlaylist] = useState<VsPlaylistPayload | null>(null);

  const sockRef = useRef<Socket | null>(null);

  const [idx, setIdx] = useState(0);
  const timerRef = useRef<number | null>(null);
  const [refreshSeq, setRefreshSeq] = useState(0);

  // Your requirement: audio should be ON by default (once unlocked)
  const soundEnabled = true;

  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem("ns2:vs-audio-unlocked") === "1";
    } catch {
      return false;
    }
  });

  // CTA displayed when unmuted autoplay is blocked
  const [needsAudioClick, setNeedsAudioClick] = useState<boolean>(false);

  // Per-video mute state that can temporarily be true to allow autoplay before unlock
  const [forceMuted, setForceMuted] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Stall detection
  const lastProgressAtRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const items = vsPlaylist?.items ?? [];
  const playing = vsState?.state === "PLAYING" && items.length > 0;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setSessionError(null);
      setPairingCode("");
      setVsState(null);
      setVsPlaylist(null);

      if (!sessionId) {
        setSessionError("Missing virtual session id.");
        return;
      }

      const res = await fetch(`/api/screens/virtual-session/${encodeURIComponent(sessionId)}`, {
        credentials: "include",
      });

      if (!res.ok) {
        const txt = await res.text();
        if (!cancelled) setSessionError(txt || "Virtual session not found");
        return;
      }

      const data = (await res.json()) as { id: string; code: string };
      const code = String(data.code ?? "").trim().toUpperCase();
      if (!cancelled) setPairingCode(code);
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!pairingCode) return;

    const key = openKey(pairingCode);
    const write = () => {
      try {
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), sessionId }));
      } catch {}
    };

    write();
    const t = window.setInterval(write, 4000);

    return () => {
      window.clearInterval(t);
      try {
        localStorage.removeItem(key);
      } catch {}
    };
  }, [pairingCode, sessionId]);

  useEffect(() => {
    if (!pairingCode) return;

    const s = io("/virtual-screen", {
      path: "/ws",
      withCredentials: true,
      transports: ["websocket", "polling"],
      query: { code: pairingCode },
    });

    sockRef.current = s;

    const onState = (p: VsStatePayload) => {
      if (!p || String(p.code ?? "").toUpperCase() !== pairingCode) return;
      setVsState(p);
    };

    const onPlaylist = (p: VsPlaylistPayload) => {
      if (!p || String(p.code ?? "").toUpperCase() !== pairingCode) return;
      setVsPlaylist(p);
    };

    const onBundle = (b: { state?: VsStatePayload; playlist?: VsPlaylistPayload }) => {
      if (b?.state) onState(b.state);
      if (b?.playlist) onPlaylist(b.playlist);
    };

    const onRefresh = (evt: { code?: string; ts?: number }) => {
      if (!evt || String(evt.code ?? "").toUpperCase() !== pairingCode) return;
      setIdx(0);
      setRefreshSeq(Date.now());
    };

    s.on("vs:state", onState);
    s.on("vs:playlist", onPlaylist);
    s.on("vs:bundle", onBundle);
    s.on("vs:refresh", onRefresh);

    const ping = () => s.emit("vs:ping", { code: pairingCode });
    ping();
    const t = window.setInterval(ping, 5000);

    return () => {
      window.clearInterval(t);
      s.disconnect();
      sockRef.current = null;
    };
  }, [pairingCode]);

  useEffect(() => {
    setIdx(0);
  }, [vsPlaylist?.playlistId, items.length]);

  const currentItem = playing ? items[idx % items.length] : null;

  const mediaUrl = useMemo(() => {
    if (!currentItem?.url) return "";
    const u = String(currentItem.url);
    const sep = u.includes("?") ? "&" : "?";
    return `${u}${sep}r=${encodeURIComponent(String(refreshSeq || 0))}`;
  }, [currentItem?.url, refreshSeq]);

  const advance = () => {
    if (!items.length) return;
    setIdx((p) => (p + 1) % items.length);
  };

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!playing) return;
    const cur = currentItem;
    if (!cur) return;

    if (cur.type === "image") {
      const ms = Number(cur.durationMs ?? 5000);
      timerRef.current = window.setTimeout(() => advance(), Math.max(500, ms));
    }

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [playing, currentItem?.id, items.length]);

  /**
   * Video autoplay strategy:
   * - If unlocked: play unmuted.
   * - If NOT unlocked: try unmuted once; if blocked, switch to muted autoplay + show CTA.
   */
  useEffect(() => {
    if (!playing || currentItem?.type !== "video") return;

    const v = videoRef.current;
    if (!v) return;

    // reset trackers / flags for each new video item
    lastProgressAtRef.current = Date.now();
    lastTimeRef.current = 0;
    setNeedsAudioClick(false);

    // If already unlocked, never force mute
    if (audioUnlocked) {
      setForceMuted(false);
      v.muted = false;
    } else {
      // Start by trying unmuted. If blocked, we will fall back to muted autoplay.
      setForceMuted(false);
      v.muted = false;
    }

    const tryStart = async () => {
      try {
        await v.play();
        // If we are not unlocked, audio might still be blocked in some cases; CTA can still be needed
        if (!audioUnlocked) {
          // If it played unmuted, great; if it got auto-muted by browser, user will notice.
          // We only show CTA when we detect blocking via catch below.
        }
      } catch {
        // Unmuted autoplay blocked: fall back to muted autoplay so video plays,
        // and show CTA to unlock audio permanently.
        setForceMuted(true);
        setNeedsAudioClick(true);
        try {
          v.muted = true;
          await v.play();
        } catch {
          // If even muted autoplay fails, CTA remains.
          setNeedsAudioClick(true);
        }
      }
    };

    tryStart();

    const onTimeUpdate = () => {
      const t = Number(v.currentTime || 0);
      if (t > lastTimeRef.current + 0.05) {
        lastTimeRef.current = t;
        lastProgressAtRef.current = Date.now();
      }
    };

    const onErrorOrAbort = () => {
      window.setTimeout(() => advance(), 400);
    };

    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("error", onErrorOrAbort);
    v.addEventListener("abort", onErrorOrAbort);
    v.addEventListener("stalled", onErrorOrAbort);

    const watchdog = window.setInterval(() => {
      const vv = videoRef.current;
      if (!vv) return;
      if (vv.ended) return;

      const now = Date.now();
      const noProgressFor = now - (lastProgressAtRef.current || now);
      if (noProgressFor >= 6000) advance();
    }, 1000);

    return () => {
      window.clearInterval(watchdog);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("error", onErrorOrAbort);
      v.removeEventListener("abort", onErrorOrAbort);
      v.removeEventListener("stalled", onErrorOrAbort);
    };
  }, [playing, currentItem?.id, refreshSeq, audioUnlocked]);

  const codeForUi = pairingCode || "— — — — —";

  const emptyPlaylistMsg =
    vsState?.state === "PLAYING" && items.length === 0 ? "Playlist is empty. Upload content to play." : null;

  const tvClass = `vs-tv ${playing && currentItem ? "vs-tv--media" : ""}`;

  return (
    <div className="vs-root">
      <div className="vs-canvas" style={{ ["--vs-scale" as any]: scale }}>
        <div className="vs-bg" aria-hidden />

        <div className={tvClass}>
          {playing && currentItem ? (
            <div className="vs-player">
              {currentItem.type === "video" ? (
                <div className="vs-videoWrap">
                  <video
                    ref={videoRef}
                    key={`${currentItem.id}-${refreshSeq}`}
                    className="vs-media"
                    src={mediaUrl}
                    autoPlay
                    playsInline
                    preload="auto"
                    muted={forceMuted || !(soundEnabled && audioUnlocked)}
                    controls={false}
                    onEnded={advance}
                    onError={advance}
                  />

                  {!audioUnlocked && needsAudioClick && (
                    <button
                      type="button"
                      className="vs-soundCta"
                      onClick={async () => {
                        setNeedsAudioClick(false);
                        setForceMuted(false);
                        setAudioUnlocked(true);
                        try {
                          localStorage.setItem("ns2:vs-audio-unlocked", "1");
                        } catch {}

                        const v = videoRef.current;
                        if (v) {
                          v.muted = false;
                          try {
                            await v.play();
                          } catch {
                            setNeedsAudioClick(true);
                          }
                        }
                      }}
                    >
                      Enable sound
                    </button>
                  )}
                </div>
              ) : (
                <img
                  key={`${currentItem.id}-${refreshSeq}`}
                  className="vs-media"
                  src={mediaUrl}
                  alt=""
                  draggable={false}
                  onError={advance}
                />
              )}
            </div>
          ) : (
            <>
              <div className="vs-tv-left">
                <div className="vs-title">Pair device</div>

                <ol className="vs-steps">
                  <li>
                    Log in to your <strong>Novasign</strong> account.
                  </li>
                  <li>
                    Open <strong>Screens</strong>, click <strong>Pair screen</strong>, and enter this code.
                  </li>
                </ol>

                <div className="vs-code" aria-label="Pairing code">
                  {codeForUi}
                </div>

                <div className="vs-debug">
                  {sessionError ? (
                    <span className="vs-debug-err">{sessionError}</span>
                  ) : emptyPlaylistMsg ? (
                    <span>{emptyPlaylistMsg}</span>
                  ) : vsState?.state === "WAITING" ? (
                    <span>Waiting for playlist assignment…</span>
                  ) : vsState?.state === "PAIR" ? (
                    <span>Waiting for pairing…</span>
                  ) : null}
                </div>
              </div>

              <div className="vs-tv-right">
                <div className="vs-qrWrap">
                  <div className="vs-qrBox">
                    {qrValue ? <QRCodeSVG value={qrValue} size={220} /> : <div className="vs-qrFallback" />}
                  </div>

                  <div className="vs-qrHint">
                    Or scan this QR code to open this screen
                    <br />
                    and pair it.
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="vs-strip">
          <div className="vs-strip-left">
            <div className="vs-brandMark" aria-hidden>
              N
            </div>
            <div className="vs-stripText">
              <div className="vs-stripTitle">Novasign Virtual Screen</div>
              <div className="vs-stripSub">If you close this tab you can relaunch it from the screens section.</div>
            </div>
          </div>

          <div className="vs-strip-right">
            <div className="vs-stripMeta">
              <div className="vs-metaLabel">Pairing code</div>
              <div className="vs-metaCode">{pairingCode || "—"}</div>
            </div>

            <div className="vs-stripQr">
              {qrValue ? <QRCodeSVG value={qrValue} size={96} /> : <div className="vs-qrFallbackSmall" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

