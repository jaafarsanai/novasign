import React from "react";

export default function TVFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="tv-wrapper">
      <div className="tv-bezel">
        <div className="tv-glass">
          {children}
        </div>
      </div>

      <div className="tv-legs">
        <div className="leg left"></div>
        <div className="leg right"></div>
      </div>
    </div>
  );
}

