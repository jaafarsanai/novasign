// admin-web/src/pages/channels/ChannelsPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ChannelsPage.css";

import CreateChannelModal from "./components/CreateChannelModal";
import ChooseOrientationModal, { Orientation } from "./components/ChooseOrientationModal";
import { coverFromSeed, getChannelCoverSeed, persistChannelCoverSeed } from "./channelCover";

/** API types (match your Nest controller payloads) */
type Channel = {
  id: string;
  name: string;
  orientation: Orientation;
  createdAt: string;
};

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

  // cover seed captured from CreateChannelModal so we can persist it after creation
  const [pendingCoverSeed, setPendingCoverSeed] = useState<string | null>(null);

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

      // Persist the exact seed used in the create modal poster,
      // so list + editor use the same cover color.
      if (pendingCoverSeed) {
        persistChannelCoverSeed(created.id, pendingCoverSeed);
        setPendingCoverSeed(null);
      }

      setItems((prev) => [created, ...prev]);
      setCreateOpen(false);
      setOrientationOpen(false);
      nav(`/channels/${created.id}`);
    } catch (e: any) {
      setError(`Channels API is not reachable (POST /api/channels failed). ${e?.message ?? ""}`.trim());
      setCreateOpen(false);
      setOrientationOpen(false);
      setPendingCoverSeed(null);
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
            setPendingCoverSeed(null);
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
            <button className="btn btn-ghost" onClick={() => setCreateOpen(true)}>
              Create New Channel
            </button>
          </div>
        ) : (
          <div className="channels-list">
            {filtered.map((c) => {
              const seed = getChannelCoverSeed(c.id);
              const bg = coverFromSeed(seed);

              return (
                <div key={c.id} className="channel-row">
                  {/* Use backgroundImage so CSS background-color !important cannot override it */}
                  <div className="channel-cover" style={{ backgroundImage: bg }} />

                  <div className="channel-meta">
                    <div className="channel-name">{c.name}</div>
                    <div className="channel-sub">{c.orientation === "landscape" ? "Landscape" : "Portrait"}</div>
                  </div>

                  <div className="channel-actions">
                    <button className="btn btn-ghost" onClick={() => nav(`/channels/${c.id}`)}>
                      Open
                    </button>

                    <div className="kebab">
                      <button className="btn btn-ghost" onClick={() => duplicateChannel(c.id)}>
                        Duplicate
                      </button>
                      <button className="btn btn-ghost danger" onClick={() => deleteChannel(c.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateChannelModal
        open={createOpen}
        value={draftName}
        onChange={setDraftName}
        onClose={() => setCreateOpen(false)}
        onContinue={(coverSeed) => {
          setPendingCoverSeed(coverSeed);
          setCreateOpen(false);
          setOrientationOpen(true);
        }}
      />

      <ChooseOrientationModal
        open={orientationOpen}
        value={draftOrientation}
        onChange={setDraftOrientation}
        onBack={() => {
          setOrientationOpen(false);
          setCreateOpen(true);
        }}
        onClose={() => {
          setOrientationOpen(false);
          setPendingCoverSeed(null);
        }}
        onCreate={(o) => createChannel(o)}
      />
    </div>
  );
}

