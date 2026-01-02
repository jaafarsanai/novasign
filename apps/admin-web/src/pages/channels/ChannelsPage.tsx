import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ChannelsPage.css";

import CreateChannelModal from "./components/CreateChannelModal";
import ChooseOrientationModal, { Orientation } from "./components/ChooseOrientationModal";

/** API types (match your Nest controller payloads) */
type Channel = {
  id: string;
  name: string;
  orientation: Orientation;
  createdAt: string;
};

function hashToInt(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

/** Stable cover from channel id (no backend required). */
function coverFromId(id: string) {
  const palette: Array<[string, string]> = [
    ["#f97316", "#ef4444"],
    ["#0ea5e9", "#6366f1"],
    ["#22c55e", "#14b8a6"],
    ["#a855f7", "#3b82f6"],
    ["#f59e0b", "#f97316"],
    ["#10b981", "#0ea5e9"],
    ["#ef4444", "#f43f5e"],
    ["#6366f1", "#a855f7"],
  ];
  const idx = hashToInt(id) % palette.length;
  const [a, b] = palette[idx];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

/** Lightweight, Vite-friendly API wrapper */
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : null;

  if (!res.ok) {
    const msg = data?.message || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return data as T;
}

export default function ChannelsPage() {
  const nav = useNavigate();

  const [items, setItems] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");

  // create flow
  const [createOpen, setCreateOpen] = useState(false);
  const [orientationOpen, setOrientationOpen] = useState(false);
  const [draftName, setDraftName] = useState("New Channel");
  const [draftOrientation, setDraftOrientation] = useState<Orientation>("landscape");

  const draftThumbBg = useMemo(() => {
    // stable thumb while channel doesn't have an id yet (based on draft name)
    const palette: Array<[string, string]> = [
      ["#0ea5e9", "#6366f1"],
      ["#22c55e", "#14b8a6"],
      ["#f59e0b", "#f97316"],
      ["#a855f7", "#3b82f6"],
      ["#ef4444", "#f43f5e"],
    ];
    const idx = hashToInt(draftName || "New Channel") % palette.length;
    const [a, b] = palette[idx];
    return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
  }, [draftName]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ items: Channel[] }>("/api/channels");
      setItems(r.items ?? []);
    } catch (e: any) {
      setError(`Channels API is not reachable (GET /api/channels failed). ${e?.message ?? ""}`.trim());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return items;
    return items.filter((c) => c.name.toLowerCase().includes(s));
  }, [items, query]);

  async function createChannel(orientation: Orientation) {
    setError(null);
    try {
      const r = await api<{ item: Channel }>("/api/channels", {
        method: "POST",
        body: JSON.stringify({ name: draftName.trim(), orientation }),
      });
      const created = r.item;
      setItems((prev) => [created, ...prev]);

      setCreateOpen(false);
      setOrientationOpen(false);

      nav(`/channels/${created.id}`);
    } catch (e: any) {
      setError(`Channels API is not reachable (POST /api/channels failed). ${e?.message ?? ""}`.trim());
      setCreateOpen(false);
      setOrientationOpen(false);
    }
  }

  async function duplicateChannel(id: string) {
    setError(null);
    try {
      const r = await api<{ item: Channel | null }>(`/api/channels/${id}/duplicate`, { method: "POST" });
      if (r.item) setItems((prev) => [r.item as Channel, ...prev]);
    } catch (e: any) {
      setError(`Duplicate failed. ${e?.message ?? ""}`.trim());
    }
  }

  async function deleteChannel(id: string) {
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/channels/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setError(`Delete failed. ${e?.message ?? ""}`.trim());
    }
  }

  return (
    <div className="channels-page">
      <div className="channels-toolbar">
        <div className="channels-title">Channels</div>

        <div className="channels-search">
          <span className="channels-search-icon" aria-hidden="true">
            ⌕
          </span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Channels" />
        </div>

        <button
          className="btn btn-primary"
          onClick={() => {
            setDraftName("New Channel");
            setDraftOrientation("landscape");
            setCreateOpen(true);
          }}
        >
          + New Channel
        </button>
      </div>

      {error && (
        <div className="channels-alert">
          <div>{error}</div>
          <button className="channels-alert-x" onClick={() => setError(null)} aria-label="Close">
            ×
          </button>
        </div>
      )}

      <div className="channels-body">
        {loading ? (
          <div className="channels-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="channels-empty">
            <img className="channels-empty-img" src="/assets/icons/emptychannel.svg" alt="" />
            <div className="channels-empty-title">Channels are your way to organize everything</div>
            <div className="channels-empty-sub">
              Add content and playlists, schedule what plays when and give everyone a voice.
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setDraftName("New Channel");
                setDraftOrientation("landscape");
                setCreateOpen(true);
              }}
            >
              Create New Channel
            </button>
          </div>
        ) : (
          <div className="channels-list">
            {filtered.map((c) => (
              <div key={c.id} className="channel-row">
                <div className="channel-cover" style={{ background: coverFromId(c.id) }} />
                <div className="channel-meta">
                  <div className="channel-name">{c.name}</div>
                  <div className="channel-sub">{c.orientation === "landscape" ? "Landscape" : "Portrait"}</div>
                </div>

                <div className="channel-actions">
                  <button className="btn btn-ghost" onClick={() => nav(`/channels/${c.id}`)}>
                    Open
                  </button>

                  <div className="channel-actions-inline">
                    <button className="btn btn-ghost" onClick={() => duplicateChannel(c.id)}>
                      Duplicate
                    </button>
                    <button className="btn btn-ghost danger" onClick={() => deleteChannel(c.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateChannelModal
        open={createOpen}
        value={draftName}
        onChange={setDraftName}
        onClose={() => setCreateOpen(false)}
        onContinue={() => {
          setDraftOrientation("landscape");
          setCreateOpen(false);
          setOrientationOpen(true);
        }}
        thumbBg={draftThumbBg}
      />

      <ChooseOrientationModal
        open={orientationOpen}
        value={draftOrientation}
        onChange={setDraftOrientation}
        onBack={() => {
          setOrientationOpen(false);
          setCreateOpen(true);
        }}
        onClose={() => setOrientationOpen(false)}
        onCreate={(o) => createChannel(o)}
      />
    </div>
  );
}

