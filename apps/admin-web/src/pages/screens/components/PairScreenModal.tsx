import React, { useEffect, useMemo, useState } from "react";
import "./PairScreenModal.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onPaired: () => void;
  initialPairCode?: string;
};

function safeUpper(s: string) {
  return String(s || "").trim().toUpperCase();
}

export default function PairScreenModal({
  open,
  onClose,
  onPaired,
  initialPairCode,
}: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setLoading(false);
    setCode(safeUpper(initialPairCode || ""));
  }, [open, initialPairCode]);

  const canSubmit = useMemo(() => safeUpper(code).length === 6 && !loading, [code, loading]);

  async function submit() {
    const pairingCode = safeUpper(code);
    if (pairingCode.length !== 6) return;

    setLoading(true);
    setErr(null);

    try {
      // Backend endpoint expected:
      // POST /api/screens/pair  { code: "ABC123" }
      // If your API uses a different route/payload, tell me and I will align it.
      const res = await fetch("/api/screens/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pairingCode }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      onPaired();
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Pairing failed");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="psm-backdrop" onMouseDown={onClose}>
      <div className="psm-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="psm-head">
          <div>
            <div className="psm-title">Pair your screen</div>
            <div className="psm-sub">
              Enter the 6-character code displayed on your TV or virtual screen.
            </div>
          </div>
          <button className="psm-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <input
          className="psm-input"
          value={code}
          onChange={(e) => setCode(safeUpper(e.target.value).slice(0, 6))}
          placeholder="ABC123"
          autoFocus
        />

        {err ? <div className="psm-error">{err}</div> : null}

        <div className="psm-actions">
          <button className="psm-btn psm-btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="psm-btn psm-btn-primary" onClick={submit} disabled={!canSubmit}>
            {loading ? "Pairing…" : "Pair Screen"}
          </button>
        </div>
      </div>
    </div>
  );
}

