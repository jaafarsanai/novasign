import React, { useMemo, useState } from "react";
import "./ChooseOrientationModal.css";

export type Orientation = "landscape" | "portrait";

export type ChooseOrientationModalProps = {
  open: boolean;
  value: Orientation;
  onChange: (v: Orientation) => void;
  onBack: () => void;
  onClose: () => void;

  /** can be async */
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
    <div className="md-modal md-open" role="dialog" aria-modal="true">
      <div className="md-backdrop" onClick={onClose} />
      <div className="md-wrapper" role="document">
        <div className="md-content com">
          <button className="md-close" aria-label="Close" onClick={onClose}>
            ×
          </button>

          <h2 className="com-title">Choose Orientation</h2>
          <p className="com-subtitle">Select a layout based on your screen orientation.</p>

          <div className="com-grid" data-testid="orientation-select">
            <label className={`com-card ${value === "landscape" ? "is-selected" : ""}`}>
              <input
                type="radio"
                name="orientation"
                value="landscape"
                checked={value === "landscape"}
                onChange={() => onChange("landscape")}
              />
              <div className="com-visual com-landscape" />
              <div className="com-name">
                <span className="com-dot" aria-hidden="true" />
                Landscape
              </div>
            </label>

            <label className={`com-card ${value === "portrait" ? "is-selected" : ""}`}>
              <input
                type="radio"
                name="orientation"
                value="portrait"
                checked={value === "portrait"}
                onChange={() => onChange("portrait")}
              />
              <div className="com-visual com-portrait" />
              <div className="com-name">
                <span className="com-dot" aria-hidden="true" />
                Portrait
              </div>
            </label>
          </div>

          <div className="com-info" data-testid="orientation-info">
            {helper}
          </div>

          <div className="com-actions">
            <button className="btn btn-ghost" onClick={onBack} disabled={busy}>
              Back
            </button>

            <button
              className="btn btn-primary"
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

