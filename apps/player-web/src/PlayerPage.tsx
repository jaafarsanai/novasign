import React from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://212.71.247.250:3000';

type ScreenStatus = 'PENDING' | 'LIVE' | 'OFFLINE';

interface ScreenDto {
  id: string;
  name: string;
  pairingCode: string;
  status: ScreenStatus;
  lastSeenAt: string | null;
}

type ViewMode = 'PAIRING' | 'LIVE';

export const PlayerPage: React.FC<{ code: string }> = ({ code }) => {
  const [mode, setMode] = React.useState<ViewMode>('PAIRING');
  const [screen, setScreen] = React.useState<ScreenDto | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/screens/by-code/${code}`);
        if (res.status === 404) {
          // Screen deleted – go back to pure pairing state
          if (!cancelled) {
            setMode('PAIRING');
            setScreen(null);
          }
          return;
        }

        const data: ScreenDto = await res.json();
        if (cancelled) return;

        setScreen(data);

        if (data.status === 'LIVE') {
          setMode('LIVE');
        } else {
          setMode('PAIRING');
        }

        // Heartbeat while we're live or pending
        await fetch(`${API_BASE}/screens/heartbeat/${code}`, {
          method: 'POST',
        }).catch(() => {});
      } catch (e) {
        console.error('poll error', e);
      }
    };

    poll();
    const id = setInterval(poll, 5000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [code]);

  // --- UI ---

  if (mode === 'LIVE') {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: 'radial-gradient(circle at top left, #2a3cff, #020617)',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        {/* Novasign logo placeholder */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 28,
            background: 'linear-gradient(135deg, #facc15, #f97316)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 40,
            fontWeight: 800,
            marginBottom: 32,
          }}
        >
          N
        </div>

        <h1 style={{ fontSize: 40, marginBottom: 12 }}>
          {screen?.name || 'Novasign Screen'}
        </h1>

        <p style={{ opacity: 0.8, fontSize: 18, maxWidth: 520, textAlign: 'center' }}>
          Connected to Novasign Admin and waiting for content…
          <br />
          You can now publish playlists or dashboards to this screen.
        </p>
      </div>
    );
  }

  // PAIRING VIEW (what you already have, but I include it for completeness)
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: 'radial-gradient(circle at top left, #020617, #000)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <div
        style={{
          width: 900,
          maxWidth: '90vw',
          height: 500,
          borderRadius: 32,
          background:
            'radial-gradient(circle at top left, rgba(250, 204, 21, 0.18), transparent 55%), #020617',
          boxShadow: '0 40px 120px rgba(0,0,0,0.8)',
          display: 'grid',
          gridTemplateColumns: '1.3fr 1fr',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '40px 48px', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 14px',
              borderRadius: 999,
              background: 'rgba(15,23,42,0.9)',
              border: '1px solid rgba(148,163,184,0.4)',
              marginBottom: 28,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '999px',
                background: '#22c55e',
              }}
            />
            <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.08 }}>
              Novasign Virtual Screen
            </span>
          </div>

          <h1 style={{ fontSize: 36, marginBottom: 12 }}>Pair device</h1>
          <ol
            style={{
              margin: 0,
              paddingLeft: 20,
              lineHeight: 1.7,
              color: 'rgba(226,232,240,0.9)',
              fontSize: 15,
            }}
          >
            <li>Login to your Novasign Admin.</li>
            <li>
              Go to <strong>Screens</strong> and enter this code in{' '}
              <strong>Pair your screen now</strong>.
            </li>
          </ol>

          <div
            style={{
              marginTop: 'auto',
              fontSize: 56,
              letterSpacing: '0.35em',
              fontWeight: 800,
            }}
          >
            <span>{code}</span>
          </div>
        </div>

        <div
          style={{
            background:
              'radial-gradient(circle at top, rgba(248,250,252,0.12), transparent 60%), rgba(15,23,42,0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* QR placeholder */}
          <div
            style={{
              width: 170,
              height: 170,
              borderRadius: 24,
              border: '6px solid white',
              boxShadow: '0 20px 60px rgba(0,0,0,0.75)',
            }}
          />
        </div>
      </div>
    </div>
  );
};

