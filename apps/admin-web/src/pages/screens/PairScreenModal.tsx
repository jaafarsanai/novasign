import React, { useEffect, useRef, useState } from "react";
import "./PairScreenModal.css";

interface PairScreenModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (code: string) => void;
  isSubmitting?: boolean;
  error?: string | null;
}

const CODE_LENGTH = 6;

const PairScreenModal: React.FC<PairScreenModalProps> = ({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
  error = null,
}) => {
  const [digits, setDigits] = useState<string[]>(
    Array.from({ length: CODE_LENGTH }, () => "")
  );

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (open) {
      setDigits(Array.from({ length: CODE_LENGTH }, () => ""));
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    }
  }, [open]);

  const handleChange = (index: number, value: string) => {
    const clean = value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
    const next = [...digits];

    if (!clean) {
      next[index] = "";
      setDigits(next);
      return;
    }

    next[index] = clean[0];
    setDigits(next);

    if (index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKey = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (event.key === "Enter") submitCode();
  };

  const submitCode = () => {
    const code = digits.join("");
    if (code.length === CODE_LENGTH) onSubmit(code);
  };

  if (!open) return null;

  return (
    <div className="pair-modal-backdrop" onMouseDown={onClose}>
      <div className="pair-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pair-modal-header">
          <h2>Pair your screen</h2>
          <button type="button" className="pair-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="pair-modal-description">
          Enter the 6-character code showing on your device to pair it with Novasign.
        </p>

        <div className="pair-modal-inputs">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              className="pair-modal-input"
              type="text"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKey(index, e)}
            />
          ))}
        </div>

        {error && <div className="pair-modal-error">{error}</div>}

        <div className="pair-modal-actions">
          <button
            type="button"
            className="pair-modal-secondary-btn"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="pair-modal-primary-btn"
            onClick={submitCode}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Pairing…" : "Pair screen"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PairScreenModal;

