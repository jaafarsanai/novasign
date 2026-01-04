import React, { useMemo, useState } from "react";
import "./ChooseOrientationModal.css";

export type Orientation = "landscape" | "portrait";

export type ChooseOrientationModalProps = {
  open: boolean;
  value: Orientation;
  onChange: (v: Orientation) => void;
  onBack: () => void;
  onClose: () => void;
  onCreate: (orientation: Orientation) => void | Promise<void>;
};

export default function ChooseOrientationModal({
  open,
  value,
  onChange,
  onBack,
  onClose,
  onCreate,
}: ChooseOrientationModalProps) {
  const [busy, setBusy] = useState(false);

  const helper = useMemo(() => {
    return value === "landscape"
      ? "Your channel will play content on landscape orientation screen only"
      : "Your channel will play content on portrait orientation screen only";
  }, [value]);

  if (!open) return null;

  return (
    <div className="md-modal md-open" role="dialog" aria-modal="true" aria-label="Choose Orientation">
      <div className="md-backdrop" onClick={onClose} />
      <div className="md-wrapper" role="document">
        <div className="md-content om-sc">
          <button className="md-close" aria-label="Close" onClick={onClose}>
            ×
          </button>

          <div className="om-body">
            <h2 className="om-title">Choose Orientation</h2>
            <p className="om-subtitle">Select a layout based on your screen orientation.</p>

            <div className="om-grid">
              <label className={`om-card ${value === "landscape" ? "is-selected" : ""}`}>
                <input
                  type="radio"
                  name="orientation"
                  value="landscape"
                  checked={value === "landscape"}
                  onChange={() => onChange("landscape")}
                />
                <div className="om-visual om-landscape" />
                <div className="om-name">
                  <span className="om-dot" aria-hidden="true" />
                  Landscape
                </div>
              </label>

              <label className={`om-card ${value === "portrait" ? "is-selected" : ""}`}>
                <input
                  type="radio"
                  name="orientation"
                  value="portrait"
                  checked={value === "portrait"}
                  onChange={() => onChange("portrait")}
                />
                <div className="om-visual om-portrait" />
                <div className="om-name">
                  <span className="om-dot" aria-hidden="true" />
                  Portrait
                </div>
              </label>
            </div>

            <div className="om-info">{helper}</div>
          </div>

          <div className="om-footer">
            <button className="btn btn-ghost" onClick={onBack} disabled={busy}>
              Back
            </button>

            <button
              className="btn btn-primary om-create"
              disabled={busy}
              onClick={async () => {
                try {
                  setBusy(true);
                  await onCreate(value);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Create Channel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

