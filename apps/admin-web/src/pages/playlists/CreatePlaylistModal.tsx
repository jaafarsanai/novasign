import React, { useEffect, useRef, useState } from "react";
import "./CreatePlaylistModal.css";

export default function CreatePlaylistModal({
  open,
  onClose,
  onCreate,
  isSubmitting = false,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
  isSubmitting?: boolean;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  if (!open) return null;

  return (
    <div className="cpm-backdrop" onMouseDown={onClose}>
      <div className="cpm-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cpm-header">
          <h2>Create playlist</h2>
          <button type="button" className="cpm-close" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="cpm-sub">
          Enter a name for your new playlist.
        </p>

        <input
          ref={inputRef}
          className="cpm-input"
          placeholder="Playlist name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreate(name);
            if (e.key === "Escape") onClose();
          }}
          disabled={isSubmitting}
        />

        <div className="cpm-actions">
          <button
            type="button"
            className="cpm-btn cpm-cancel"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cpm-btn cpm-create"
            onClick={() => onCreate(name)}
            disabled={isSubmitting || !name.trim()}
          >
            {isSubmitting ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

