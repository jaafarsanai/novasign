// src/pages/virtual/VirtualScreenPage.tsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "./VirtualScreen.css";

export default function VirtualScreenPage() {
  const { code } = useParams();
  const [copied, setCopied] = useState(false);

  const pairingCode = code?.toUpperCase() ?? "------";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(pairingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="vs-container">
      <div className="vs-tv-frame">

        {/* HEADER */}
        <div className="vs-header">
          <div className="vs-dot red"></div>
          <div className="vs-dot yellow"></div>
          <div className="vs-dot green"></div>
        </div>

        {/* CONTENT */}
        <div className="vs-content">
          <h1 className="vs-title">Your Screen is Ready</h1>
          <p className="vs-subtitle">Use this code to pair the screen</p>

          <div className="vs-code-box">
            {pairingCode.split("").map((char, i) => (
              <div key={i} className="vs-code-char">
                {char}
              </div>
            ))}
          </div>

          <button className="vs-copy-btn" onClick={handleCopy}>
            {copied ? "Copied!" : "Click to copy"}
          </button>
        </div>

      </div>
    </div>
  );
}

