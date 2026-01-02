import React, { useMemo, useState } from "react";
import "./CreateChannelModal.css";

export type CreateChannelModalProps = {
  open: boolean;
  value: string;
  onChange: React.Dispatch<React.SetStateAction<string>>;
  onClose: () => void;
  onContinue: () => void;

  /** Optional preview background (css background string). If omitted a default gradient is used. */
  thumbBg?: string;
};

export default function CreateChannelModal({
  open,
  value,
  onChange,
  onClose,
  onContinue,
  thumbBg,
}: CreateChannelModalProps) {
  const [touched, setTouched] = useState(false);

  const cover = useMemo(() => {
    return (
      thumbBg ??
      "linear-gradient(135deg, rgba(79,70,229,.85) 0%, rgba(124,58,237,.80) 50%, rgba(59,130,246,.75) 100%)"
    );
  }, [thumbBg]);

  if (!open) return null;

  const trimmed = value.trim();
  const invalid = touched && trimmed.length === 0;

  return (
    <div className="md-modal md-open" role="dialog" aria-modal="true">
      <div className="md-backdrop" onClick={onClose} />
      <div className="md-wrapper" role="document">
        <div className="md-content ccm">
          <button className="md-close" aria-label="Close" onClick={onClose}>
            ×
          </button>

          <h2 className="ccm-title">Create a new channel</h2>
          <p className="ccm-subtitle">
            Create a channel to play individual media, show live URL feeds, Dashboards, integrated apps, Canvas creations
            and Playlists.
          </p>

          <div className="ccm-cover" style={{ background: cover }} />

          <div className="ccm-field">
            <input
              className={`ccm-input ${invalid ? "is-invalid" : ""}`}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="New Channel"
              autoFocus
            />
            <div className="ccm-underline" />
          </div>

          <div className="ccm-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                setTouched(true);
                if (trimmed.length === 0) return;
                onContinue();
              }}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

