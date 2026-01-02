import React, { useEffect, useState } from "react";
import { apiPost } from "../../api/api";
import "./NewPlaylistModal.css";

export default function NewPlaylistModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setError(null);
    setSaving(false);
  }, [open]);

  async function submit() {
    const n = name.trim();
    if (!n) return;

    setSaving(true);
    setError(null);

    try {
      const created = await apiPost<{ id: string }>("/playlists", { name: n });
      onCreated(created.id);
    } catch (e: any) {
      setError(e?.message || String(e));
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="npl-backdrop" onMouseDown={onClose}>
      <div className="npl-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="npl-top">
          <div className="npl-title">New playlist</div>
          <button className="npl-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="npl-field">
          <div className="npl-label">Playlist name</div>
          <input
            className="npl-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lobby TV"
          />
        </div>

        {error && <div className="npl-error">{error}</div>}

        <div className="npl-actions">
          <button className="npl-btn" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="npl-btn npl-btn-primary" type="button" onClick={submit} disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

