// admin-web/src/pages/channels/components/CreateChannelModal.tsx
import React, { useEffect, useMemo, useState } from "react";
import "./CreateChannelModal.css";
import { coverFromSeed } from "../channelCover";

export type CreateChannelModalProps = {
  open: boolean;
  value: string;
  onChange: React.Dispatch<React.SetStateAction<string>>;
  onClose: () => void;

  /**
   * We pass a coverSeed so ChannelsPage can persist it
   * after the backend returns the created channel id.
   */
  onContinue: (coverSeed: string) => void;
};

function makeSeed() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = window.crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // ignore
  }
  return `seed_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function CreateChannelModal({
  open,
  value,
  onChange,
  onClose,
  onContinue,
}: CreateChannelModalProps) {
  const [touched, setTouched] = useState(false);
  const [coverSeed, setCoverSeed] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setCoverSeed(makeSeed());
    setTouched(false);
  }, [open]);

  const trimmed = value.trim();
  const invalid = touched && trimmed.length === 0;

  const posterBg = useMemo(() => {
    return coverFromSeed(coverSeed || "seed");
  }, [coverSeed]);

  if (!open) return null;

  return (
    <div className="md-modal md-open" role="dialog" aria-modal="true" aria-label="Create a new channel">
      <div className="md-backdrop" onClick={onClose} />
      <div className="md-wrapper" role="document">
        <div className="md-content md-sc">
          <button className="md-close" aria-label="Close" onClick={onClose}>
            ×
          </button>

          <div className="sc-body">
            <h2 className="sc-title">Create a new channel</h2>
            <p className="sc-subtitle">
              Create a channel to play individual media, show live URL feeds, Dashboards, integrated apps, Canvas
              creations and Playlists.
            </p>

            <div className="sc-poster" style={{ background: posterBg }} aria-hidden="true">
              <div className="sc-poster-bars">
                <div className="sc-bar sc-bar-1" />
                <div className="sc-bar sc-bar-2" />
                <div className="sc-bar sc-bar-3" />
              </div>
            </div>

            <div className="sc-input-wrap">
              <input
                className={`sc-input ${invalid ? "is-invalid" : ""}`}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="New Channel"
                autoFocus
              />
              <div className="sc-underline" />
            </div>
          </div>

          <div className="sc-footer">
            <button
              className="btn btn-primary sc-primary"
              onClick={() => {
                setTouched(true);
                if (trimmed.length === 0) return;
                onContinue(coverSeed || "seed");
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

