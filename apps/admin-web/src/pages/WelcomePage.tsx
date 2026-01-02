// src/pages/WelcomePage.tsx
import '../App.css';

export default function WelcomePage() {
  return (
    <div className="page">
      <h1 className="page-title">Welcome</h1>
      <p className="page-subtitle">
        Get started by creating content, pairing a screen, and sending a playlist.
      </p>

      <div className="welcome-grid">
        <div className="welcome-card">
          <h2>Create screen-ready content</h2>
          <p>Create stylish content, no design skills needed.</p>
        </div>
        <div className="welcome-card">
          <h2>Pair a screen</h2>
          <p>Connect any player or browser to Novasign.</p>
        </div>
        <div className="welcome-card">
          <h2>Set content to screen</h2>
          <p>Assign channels and playlists to your screens.</p>
        </div>
      </div>
    </div>
  );
}

