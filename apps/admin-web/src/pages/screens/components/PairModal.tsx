import React, { useState } from "react";
import "./PairModal.css";

const API_BASE = import.meta.env.VITE_API_URL;

interface Props {
  onClose: () => void;
  reload: () => void;
}

export default function PairModal({ onClose, reload }: Props) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePair = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError("Please enter a 6-character code.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/screens/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });

      if (res.status === 404) {
        setError("No screen found with that code.");
        return;
      }

      if (!res.ok) {
        setError("Pairing failed. Try again.");
        return;
      }

      onClose();
      reload();
    } catch {
      setError("Connection error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handlePair();
    if (e.key === "Escape") onClose();
  };

  return (
    <div className="pair-bg">
      <div className="pair-modal">
        <h2 className="pair-title">Pair your screen</h2>
        <p className="pair-subtitle">
          Enter the 6-character pairing code shown on the device.
        </p>

        <input
          className="pair-input"
          maxLength={6}
          autoFocus
          placeholder="ABC123"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={handleKey}
        />

        {error && <div className="pair-error">{error}</div>}

        <div className="pair-actions">
          <button className="btn-cancel" onClick={onClose} disabled={loading}>
            Cancel
          </button>

          <button
            className="btn-primary"
            onClick={handlePair}
            disabled={loading}
          >
            {loading ? "Pairing…" : "Pair screen"}
          </button>
        </div>
      </div>
    </div>
  );
}

