import React, { useLayoutEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import "./VirtualScreenPage.css";

type Params = {
  code?: string;
};

const DESIGN_W = 1920;
const DESIGN_H = 1080;

function normalizeCode(input?: string) {
  return (input ?? "").trim().toUpperCase();
}

export default function VirtualScreenPage() {
  const params = useParams<Params>();
  const code = useMemo(() => normalizeCode(params.code), [params.code]);

  // Use current URL for QR (scan opens this screen)
  const qrValue = useMemo(() => {
    try {
      return window.location.href;
    } catch {
      return "";
    }
  }, []);

  const [scale, setScale] = useState(1);

  // COVER scaling (no letterboxing): scale = max(vw/1920, vh/1080)
  useLayoutEffect(() => {
    const calc = () => {
      const vv = window.visualViewport;

      // visualViewport reacts to zoom better than innerWidth/innerHeight
      const vw = vv?.width ?? window.innerWidth;
      const vh = vv?.height ?? window.innerHeight;

      const s = Math.max(vw / DESIGN_W, vh / DESIGN_H);
      setScale(Number.isFinite(s) && s > 0 ? s : 1);
    };

    calc();

    window.addEventListener("resize", calc);
    window.visualViewport?.addEventListener("resize", calc);
    window.visualViewport?.addEventListener("scroll", calc); // helps on some browsers during zoom

    return () => {
      window.removeEventListener("resize", calc);
      window.visualViewport?.removeEventListener("resize", calc);
      window.visualViewport?.removeEventListener("scroll", calc);
    };
  }, []);

  return (
    <div className="vs-root">
      <div className="vs-canvas" style={{ ["--vs-scale" as any]: scale }}>
        {/* Background (exact 1920x1080 canvas) */}
        <div className="vs-bg" aria-hidden />

        {/* TV overlay (must stay inside the TV black area) */}
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

            <div className="vs-code" aria-label="Pairing code">
              {code || "— — — — —"}
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
              <div className="vs-metaCode">{code || "—"}</div>
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

