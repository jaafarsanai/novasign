import React, { useEffect, useState } from "react";

type PlaylistItem = { type: "image" | "video"; url: string; duration?: number };
type Playlist = { id: string; name: string; items: any };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...init,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw data ?? new Error(`HTTP ${res.status}`);
  return data as T;
}

export default function PlaylistsPage() {
  const [items, setItems] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<Playlist[]>("/playlists");
      setItems(data);
    } catch (e: any) {
      setError(typeof e === "string" ? e : JSON.stringify(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    setError(null);
    try {
      await api<Playlist>("/playlists", {
        method: "POST",
        body: JSON.stringify({
          name,
          items: [] as PlaylistItem[],
        }),
      });
      setCreateOpen(false);
      setName("");
      await load();
    } catch (e: any) {
      setError(typeof e === "string" ? e : JSON.stringify(e));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Playlists</h1>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            New Playlist
          </button>
        </div>
      </div>

      {error ? <div className="alert alert-error">{error}</div> : null}

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div className="card">
          {items.length === 0 ? (
            <div className="empty">No playlists yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{Array.isArray(p.items) ? p.items.length : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {createOpen ? (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Create playlist</h3>
            </div>

            <div className="modal-body">
              <label className="field">
                <div className="label">Name</div>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Lobby loop"
                />
              </label>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={onCreate} disabled={!name.trim()}>
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

