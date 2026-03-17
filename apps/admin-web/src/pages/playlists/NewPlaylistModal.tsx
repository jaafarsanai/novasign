import React, { useEffect, useMemo, useRef, useState } from "react";
import "./NewPlaylistModal.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
};

export default function NewPlaylistModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setBusy(false);
      setError(null);
      return;
    }

    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const trimmedName = useMemo(() => name.trim(), [name]);
  const canSubmit = trimmedName.length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const data = await res.json().catch(() => null);
      const id = data?.id ?? data?.item?.id ?? data?.data?.id;

      if (!id) throw new Error("Playlist created but no id was returned.");

      onCreated(String(id));
    } catch (e: any) {
      setError(e?.message || "Failed to create playlist.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="npm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Create new playlist"
      onMouseDown={onClose}
    >
      <div className="npm-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="npm-header">
          <div>
            <div className="npm-title">Create new playlist</div>
            <div className="npm-subtitle">
              Give your playlist a clear name. You can add media right after creation.
            </div>
          </div>

          <button type="button" className="npm-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="npm-body">
          <label className="npm-label" htmlFor="playlist-name">
            Playlist name
          </label>

          <input
            id="playlist-name"
            ref={inputRef}
            className="npm-input"
            placeholder="e.g. Lobby TV"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            disabled={busy}
            maxLength={120}
          />

          <div className="npm-help">
            Choose a short, recognizable name such as location, purpose, or screen type.
          </div>

          {error ? <div className="npm-error">{error}</div> : null}
        </div>

        <div className="npm-footer">
          <button type="button" className="npm-btn npm-btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>

          <button type="button" className="npm-btn npm-btn-primary" onClick={submit} disabled={!canSubmit}>
            {busy ? "Creating…" : "Create playlist"}
          </button>
        </div>
      </div>
    </div>
  );
}