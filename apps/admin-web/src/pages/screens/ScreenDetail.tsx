import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import StatusBadge from "../../components/StatusBadge";
import DeleteModal from "./DeleteModal";

const API_BASE =
  import.meta.env.VITE_API_URL || "http://212.71.247.250:3000";

export default function ScreenDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [screen, setScreen] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");

  const loadScreen = async () => {
    try {
      const res = await fetch(`${API_BASE}/screens/${id}`);
      if (!res.ok) throw new Error("Not found");

      const data = await res.json();
      setScreen(data);
      setNewName(data.name);
    } catch (err) {
      navigate("/screens");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScreen();
  }, [id]);

  if (loading) return <div>Loading…</div>;
  if (!screen) return <div>Not found</div>;

  return (
    <div className="screen-detail-page">
      {/* LEFT COLUMN */}
      <aside className="screen-detail-sidebar">
        <h2 className="device-title">{screen.name}</h2>

        <div className="device-meta-line">
          Registration Code:
          <strong>{screen.pairingCode}</strong>
        </div>

        <div className="device-meta-line">
          Status: <StatusBadge status={screen.status} />
        </div>

        <div className="device-meta-line">
          Last Seen:
          {screen.lastSeenAt
            ? new Date(screen.lastSeenAt).toLocaleString()
            : "—"}
        </div>

        <div className="device-meta-line">
          Type: {screen.isVirtual ? "Virtual Device" : "Hardware Player"}
        </div>

        {/* ACTIONS */}
        <div className="device-actions">
          <button className="btn btn-primary">Set Content</button>
          <button className="btn btn-ghost">Refresh</button>

          {/* Rename UI */}
          {renaming ? (
            <div className="rename-box">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="input"
                autoFocus
              />
              <div className="rename-actions">
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    await fetch(`${API_BASE}/screens/${id}/rename`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: newName }),
                    });
                    setRenaming(false);
                    loadScreen();
                  }}
                >
                  Save
                </button>

                <button
                  className="btn btn-ghost"
                  onClick={() => setRenaming(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-ghost" onClick={() => setRenaming(true)}>
              Rename
            </button>
          )}

          <button className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
            Delete
          </button>
        </div>
      </aside>

      {/* RIGHT COLUMN */}
      <main className="screen-detail-preview">
        {screen.status === "PENDING" && (
          <div className="preview-box pending">
            <h3>Awaiting Pairing</h3>
            <p>Enter this code in your Admin Panel:</p>
            <div className="pairing-code-big">{screen.pairingCode}</div>
          </div>
        )}

        {screen.status === "OFFLINE" && (
          <div className="preview-box offline">
            <h3>Device Offline</h3>
            <p>We lost connection with this screen.</p>
          </div>
        )}

        {screen.status === "LIVE" && (
          <div className="preview-box live">
            <h3>Live Preview</h3>
            <div className="live-preview-box">Preview coming soon…</div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {deleteOpen && (
        <DeleteModal
          name={screen.name}
          onClose={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await fetch(`${API_BASE}/screens/${id}`, { method: "DELETE" });
            navigate("/screens");
          }}
        />
      )}
    </div>
  );
}

