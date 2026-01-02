// src/pages/DevicesPage.tsx
import React, { useCallback, useEffect, useState } from 'react';

type ScreenStatus = 'PENDING' | 'LIVE' | 'OFFLINE';

type Screen = {
  id: string;
  name: string;
  pairingCode: string;
  status: ScreenStatus;
  lastSeenAt: string | null;
  isVirtual?: boolean;
};

const API_BASE =
  import.meta.env.VITE_API_URL || 'http://212.71.247.250:3000';

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) return '—';
  try {
    const date = new Date(lastSeenAt);
    return date.toLocaleString();
  } catch {
    return lastSeenAt;
  }
}

const DevicesPage: React.FC = () => {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [launching, setLaunching] = useState<boolean>(false);

  // Pair modal
  const [pairModalOpen, setPairModalOpen] = useState<boolean>(false);
  const [pairCode, setPairCode] = useState<string>('');
  const [pairing, setPairing] = useState<boolean>(false);
  const [pairError, setPairError] = useState<string | null>(null);

  const loadScreens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/screens`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as Screen[];

      // IMPORTANT: only show already-claimed / non-pending screens
      const filtered = data.filter((s) => s.status !== 'PENDING');
      setScreens(filtered);
    } catch (e) {
      console.error('Failed to load screens', e);
      setError('Failed to load screens');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScreens();
  }, [loadScreens]);

  // Launch virtual screen: open /player/:code in a new tab
  // NOTE: we do NOT rely on it being added to DB; it is paired later.
  const handleLaunchVirtualScreen = async () => {
    setLaunching(true);
    setBanner(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/screens/virtual`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      // Support both shapes: { pairingCode } or { screen: { pairingCode } }
      const pairingCode =
        data.pairingCode ??
        (data.screen ? data.screen.pairingCode : undefined);

      if (!pairingCode) {
        throw new Error('No pairing code returned from server.');
      }

      const playerUrl = `${window.location.origin}/player/${pairingCode}`;
      window.open(playerUrl, '_blank', 'noopener,noreferrer');

      // We still reload but list hides PENDING screens anyway
      void loadScreens();
    } catch (e) {
      console.error('Failed to launch virtual screen', e);
      setError('Failed to launch virtual screen');
    } finally {
      setLaunching(false);
    }
  };

  const openPairModal = () => {
    setPairCode('');
    setPairError(null);
    setPairModalOpen(true);
  };

  const closePairModal = () => {
    if (pairing) return;
    setPairModalOpen(false);
    setPairError(null);
    setPairCode('');
  };

  const handleConfirmPair = async () => {
    const trimmed = pairCode.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setPairError('Please enter a 6-character code.');
      return;
    }

    setPairError(null);
    setPairing(true);
    try {
      const res = await fetch(`${API_BASE}/screens/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });

      if (res.status === 404) {
        setPairError('No screen found with that code.');
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setPairModalOpen(false);
      setBanner('Screen paired successfully.');
      void loadScreens();
    } catch (e) {
      console.error('Failed to pair screen', e);
      setPairError('Failed to pair screen. Please try again.');
    } finally {
      setPairing(false);
    }
  };

  const handleDeleteScreen = async (screen: Screen) => {
    const confirmed = window.confirm(
      `Delete screen "${screen.name}" (${screen.pairingCode})?`,
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`${API_BASE}/screens/${screen.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      setBanner('Screen deleted.');
      void loadScreens();
    } catch (e) {
      console.error('Failed to delete screen', e);
      setError('Failed to delete screen');
    }
  };

  const handleRefreshScreen = async (screen: Screen) => {
    alert(
      `Refresh screen "${screen.name}" – later this will ping the player to reload its content.`,
    );
  };

  const handleSetContent = (screen: Screen) => {
    alert(
      `Set content for "${screen.name}" – later this will let you choose a playlist or app.`,
    );
  };

  const isEmpty = !loading && screens.length === 0;

  return (
    <div className="page">
      {/* HEADER */}
      <div className="page-header">
        <h1 className="page-title">Screens</h1>
        <p className="page-subtitle">
          Let&apos;s get your first screen connected.
        </p>
      </div>

      {/* ALERTS */}
      {error && <div className="alert alert-error">{error}</div>}
      {banner && !error && (
        <div className="alert alert-success">{banner}</div>
      )}

      {/* =======================================
          EMPTY STATE (NO SCREENS YET)
         ======================================= */}
      {isEmpty && (
        <div className="screens-empty-root">
          <div className="screens-empty-left">
            <h2 className="screens-empty-title">
              Let&apos;s get your first screen online
            </h2>
            <p className="screens-empty-text">
              Launch a virtual screen to experiment, or connect a real device
              using its pairing code.
            </p>

            <div className="screens-empty-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={openPairModal}
              >
                Pair your screen now
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleLaunchVirtualScreen}
                disabled={launching}
              >
                {launching ? 'Launching…' : 'Launch a virtual screen'}
              </button>
            </div>

            <ul className="screens-empty-bullets">
              <li>Connect any TV, PC, or media player.</li>
              <li>Preview how content will look in real time.</li>
              <li>Perfect for testing before going live.</li>
            </ul>
          </div>

          <div className="screens-empty-right">
            <div className="screens-empty-illustration">
              <div className="screens-empty-tv">
                <div className="screens-empty-tv-screen">
                  <span className="screens-empty-tv-dot dot-red" />
                  <span className="screens-empty-tv-dot dot-yellow" />
                  <span className="screens-empty-tv-dot dot-green" />
                  <div className="screens-empty-tv-bar" />
                  <div className="screens-empty-tv-bar small" />
                </div>
                <div className="screens-empty-tv-stand" />
              </div>
              <div className="screens-empty-orbit" />
            </div>
          </div>
        </div>
      )}

      {/* =======================================
          LIST VIEW (WHEN SCREENS EXIST)
         ======================================= */}
      {!isEmpty && (
        <div className="card">
          <div className="card-header-row">
            <div>
              <h3 className="card-title">Your screens</h3>
              <p className="card-subtitle">
                Manage online players, preview content and control power modes.
              </p>
            </div>
            <div className="card-header-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleLaunchVirtualScreen}
                disabled={launching}
              >
                {launching ? 'Launching…' : 'Launch virtual screen'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={openPairModal}
              >
                Pair screen
              </button>
            </div>
          </div>

          <div className="card-body">
            {loading && <div>Loading screens…</div>}

            {!loading && screens.length > 0 && (
              <table className="table screens-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Reg. code</th>
                    <th>Status</th>
                    <th>Last seen</th>
                    <th style={{ width: 240 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {screens.map((screen) => (
                    <tr key={screen.id}>
                      <td>{screen.name}</td>
                      <td>{screen.pairingCode}</td>
                      <td>
                        <span
                          className={`status-badge status-badge--${screen.status.toLowerCase()}`}
                        >
                          {screen.status === 'LIVE'
                            ? 'Live'
                            : screen.status === 'PENDING'
                            ? 'Pending'
                            : 'Offline'}
                        </span>
                      </td>
                      <td>{formatLastSeen(screen.lastSeenAt)}</td>
                      <td>
                        <div className="screen-actions">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => handleSetContent(screen)}
                          >
                            Set content
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => handleRefreshScreen(screen)}
                          >
                            Refresh
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-danger"
                            onClick={() => handleDeleteScreen(screen)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {!loading && screens.length === 0 && (
              <div className="empty-state">No screens yet.</div>
            )}
          </div>
        </div>
      )}

      {/* PAIR MODAL */}
      {pairModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 className="modal-title">Enter pairing code</h2>
            <p className="modal-subtitle">
              You can find this code on your Novasign player or virtual screen.
            </p>

            <input
              type="text"
              className="input"
              maxLength={6}
              value={pairCode}
              onChange={(e) => setPairCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              autoFocus
            />

            {pairError && <div className="text-error">{pairError}</div>}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={closePairModal}
                disabled={pairing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmPair}
                disabled={pairing}
              >
                {pairing ? 'Pairing…' : 'Pair screen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DevicesPage;

