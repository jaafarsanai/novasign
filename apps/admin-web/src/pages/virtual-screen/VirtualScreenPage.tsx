import React, { useLayoutEffect, useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import "./VirtualScreenPage.css";

type Params = {
  id?: string;
};

const DESIGN_W = 1920;
const DESIGN_H = 1080;

type VirtualSession = {
  id: string;
  pairingCode: string;
};

function normalizeCode(input?: string) {
  return (input ?? "").trim().toUpperCase();
}

async function apiJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export default function VirtualScreenPage() {
  const { id } = useParams<Params>();
  const navigate = useNavigate();

  const [pairingCode, setPairingCode] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(id ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create or fetch session
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoadError(null);

        // If no id in URL -> create session -> replace URL with opaque id
        if (!id) {
          const created = await apiJson<VirtualSession>("/api/screens/virtual-sessions", {
            method: "POST",
            body: JSON.stringify({}),
          });

          if (cancelled) return;

          const code = normalizeCode(created.pairingCode);
          setPairingCode(code);
          setSessionId(created.id);

          navigate(`/virtual-screen/${created.id}`, { replace: true });
          return;
        }

        // Has id -> fetch
        const fetched = await apiJson<VirtualSession>(`/api/screens/virtual-sessions/${id}`, {
          method: "GET",
        });

        if (cancelled) return;

        const code = normalizeCode(fetched.pairingCode);
        setPairingCode(code);
        setSessionId(fetched.id);
      } catch (e: any) {
        if (cancelled) return;
        setLoadError(e?.message || "Failed to load virtual screen session.");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  // QR should point to /virtual-screen/<opaque-id>, never window.location.href
  const qrValue = useMemo(() => {
    if (!sessionId) return "";
    try {
      return new URL(`/virtual-screen/${sessionId}`, window.location.origin).toString();
    } catch {
      return "";
    }
  }, [sessionId]);

  const [scale, setScale] = useState(1);

  // COVER scaling (no letterboxing): scale = max(vw/1920, vh/1080)
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

  // Click-to-copy
  const [copied, setCopied] = useState(false);

  const copyCode = useCallback(async () => {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = pairingCode;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      } catch {
        // ignore
      }
    }
  }, [pairingCode]);

  const codeDisplay = pairingCode || "— — — — —";

  return (
    <div className="vs-root">
      <div className="vs-canvas" style={{ ["--vs-scale" as any]: scale }}>
        {/* Background (exact 1920x1080 canvas) */}
        <div className="vs-bg" aria-hidden />

        {/* TV overlay */}
        <div className="vs-tv">
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

            {/* TV code: 70px */}
            <button
              type="button"
              className="vs-tvCode vs-codeBtn"
              aria-label="Pairing code (click to copy)"
              title="Click to copy"
              onClick={copyCode}
              disabled={!pairingCode}
            >
              {codeDisplay}
            </button>

            {loadError ? <div className="vs-error">{loadError}</div> : null}
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
        </div>

        {/* Bottom info strip */}
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

              {/* Strip code: keep small */}
              <button
                type="button"
                className="vs-metaCode vs-codeBtn"
                title="Click to copy"
                onClick={copyCode}
                disabled={!pairingCode}
              >
                {pairingCode || "—"}
              </button>
            </div>

            <div className="vs-stripQr">
              {qrValue ? <QRCodeSVG value={qrValue} size={96} /> : <div className="vs-qrFallbackSmall" />}
            </div>
          </div>
        </div>

        {/* Small toast */}
        {copied ? <div className="vs-copiedToast">Copied</div> : null}
      </div>
    </div>
  );
}

