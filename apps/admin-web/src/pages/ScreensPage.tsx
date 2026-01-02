import React, { useMemo, useState } from "react";

function genCode(len = 5) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function ScreensPage() {
  const [pairModalOpen, setPairModalOpen] = useState(false);

  const onLaunchVirtual = () => {
    const code = genCode(5);
    // IMPORTANT: do not POST anything here (prevents auto DB insert)
    window.open(`/virtual-screen/${code}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Screens</h1>

        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={onLaunchVirtual}>
            Launch virtual screen
          </button>

          <button type="button" className="btn btn-secondary" onClick={() => setPairModalOpen(true)}>
            Pair screen
          </button>
        </div>
      </div>

      {/* your existing table/list stays unchanged */}

      {pairModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Pair screen</h3>
            </div>
            <div className="modal-body">
              {/* keep your existing pairing form */}
              <p>Enter the pairing code shown on the device.</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setPairModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

