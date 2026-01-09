import React, { useEffect, useMemo, useRef, useState } from "react";
import "./PairScreenModal.css";

type Props = {
  open: boolean;
  onClose: () => void;

  // Accept previewMode optionally to avoid future TS pain:
  // - ScreensPage can pass (code) => ...
  // - Modal can call (code, previewMode)
  onSubmit: (code: string, previewMode?: boolean) => Promise<void> | void;

  // ✅ these fix your current build error
  isSubmitting?: boolean;
  error?: string | null;
};

function normalizeCode(v: string) {
  return v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
}

export default function PairScreenModal({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
  error = null,
}: Props) {
  const [code, setCode] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setCode("");
      setPreviewMode(false);
      return;
    }

    // Ensure caret is visible immediately when modal opens
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const cleanCode = useMemo(() => normalizeCode(code), [code]);
  const canContinue = cleanCode.length === 6 && !isSubmitting;

  if (!open) return null;

  return (
    <div className="pairModalOverlay" role="dialog" aria-modal="true" aria-label="New Screen">
      <div className="pairModal">
        {/* Header */}
        <div className="pairModalHeader">
          <div className="pairModalTitle">New Screen</div>
          <button className="pairModalClose" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="pairModalBody">
          <div className="pairTv">
            {/* Top-left logo mark (keep) */}
            <div className="pairTvLogo" aria-hidden>
              <div className="pairTvLogoMark" />
            </div>

            <div className="pairTvCenter">
              <div className="pairTvPrompt">
                Enter the 6-character pairing code <span className="pairTvHelp">?</span>
              </div>

              {/* Big input, with caret blinking to show where to type */}
              <input
                ref={inputRef}
                className="pairTvCodeInput"
                value={code}
                onChange={(e) => setCode(normalizeCode(e.target.value))}
                inputMode="text"
                autoComplete="one-time-code"
                disabled={isSubmitting}
                aria-label="Pairing code"
              />

              <div className="pairTvUnderline" />

              <label className="pairTvCheckbox">
                <input
                  type="checkbox"
                  checked={previewMode}
                  onChange={(e) => setPreviewMode(e.target.checked)}
                  disabled={isSubmitting}
                />
                <span>Start screen in Preview Mode</span>
              </label>

              <div className="pairTvNote">
                To keep your paired screens after this date, please add your payment details.
              </div>

              {error ? <div className="pairTvError">{error}</div> : null}
            </div>
          </div>
        </div>

        {/* Footer: only Continue (no Replace device instead) */}
        <div className="pairModalFooter">
          <button
            className="pairContinueBtn"
            disabled={!canContinue}
            onClick={() => onSubmit(cleanCode, previewMode)}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

