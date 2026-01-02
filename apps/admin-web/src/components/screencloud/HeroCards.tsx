import React from "react";

export const HeroCards: React.FC<{
  onPair: () => void;
  onLaunch: () => void;
  launching: boolean;
}> = ({ onPair, onLaunch, launching }) => {
  return (
    <div className="sc-hero-wrapper">
      {/* Left card */}
      <div className="sc-hero-card sc-hero-left">
        <h2 className="sc-hero-title">I know what I'm doing</h2>
        <p className="sc-hero-text">
          I have a screen displaying a pairing code and I’m ready to connect.
        </p>
        <button className="btn btn-primary" onClick={onPair}>
          Pair your screen now
        </button>
      </div>

      {/* Right card */}
      <div className="sc-hero-card sc-hero-right">
        <h2 className="sc-hero-title">I just want to experiment with it</h2>
        <p className="sc-hero-text">
          No screen? No problem! Launch a virtual screen to try pairing and
          display content.
        </p>
        <button
          className="btn btn-secondary"
          disabled={launching}
          onClick={onLaunch}
        >
          {launching ? "Launching…" : "Launch a Virtual Screen"}
        </button>
      </div>
    </div>
  );
};

