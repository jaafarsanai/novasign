import React, { useEffect, useMemo, useState } from "react";
import NewPlaylistModal from "../playlists/NewPlaylistModal";
import "./AssignPlaylistModal.css";

type PlaylistDto = {
  id: string;
  name: string;
  updatedAt: string;
};

type ScreenRow = {
  id: string;
  name: string;
  pairingCode: string;
  assignedPlaylistId: string | null;
};

export default function AssignPlaylistModal({
  open,
  screen,
  onClose,
  onSaved,
}: {
  open: boolean;
  screen: ScreenRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<PlaylistDto[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [newPlOpen, setNewPlOpen] = useState(false);

  async function loadPlaylists() {
    setError(null);
    const res = await fetch("/api/playlists", { credentials: "include" });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const data = (await res.json()) as PlaylistDto[];
    setItems(data);
  }

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(screen?.assignedPlaylistId ?? null);
    loadPlaylists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, screen?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => p.name.toLowerCase().includes(q));
  }, [items, query]);

  async function save() {
    if (!screen) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/screens/${encodeURIComponent(screen.id)}/assign-playlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ playlistId: selected }),
      });

      if (!res.ok) {
        setError(await res.text());
        return;
      }

      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (!open || !screen) return null;

  return (
    <div className="apl-backdrop" onMouseDown={onClose}>
      <div className="apl-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="apl-top">
          <div>
            <div className="apl-title">Set content</div>
            <div className="apl-sub">
              Screen: <b>{screen.name}</b> • Code: <b>{screen.pairingCode}</b>
            </div>
          </div>

          <button className="apl-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="apl-toolbar">
          <input
            className="apl-search"
            placeholder="Search playlists"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <button type="button" className="apl-new" onClick={() => setNewPlOpen(true)}>
            New playlist
          </button>
        </div>

        {error && <div className="apl-error">{error}</div>}

        <div className="apl-list">
          <label className="apl-row">
            <input
              type="radio"
              name="pl"
              checked={selected === null}
              onChange={() => setSelected(null)}
            />
            <div className="apl-row-main">
              <div className="apl-row-name">No playlist assigned</div>
              <div className="apl-row-sub">Screen will show “Waiting for content”.</div>
            </div>
          </label>

          {filtered.map((p) => (
            <label className="apl-row" key={p.id}>
              <input
                type="radio"
                name="pl"
                checked={selected === p.id}
                onChange={() => setSelected(p.id)}
              />
              <div className="apl-row-main">
                <div className="apl-row-name">{p.name}</div>
                <div className="apl-row-sub">
                  Updated {new Date(p.updatedAt).toLocaleString()}
                </div>
              </div>
            </label>
          ))}
        </div>

        <div className="apl-actions">
          <button type="button" className="apl-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="apl-btn apl-btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <NewPlaylistModal
          open={newPlOpen}
          onClose={() => setNewPlOpen(false)}
          onCreated={async () => {
            setNewPlOpen(false);
            await loadPlaylists();
          }}
        />
      </div>
    </div>
  );
}

