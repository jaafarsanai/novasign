import React, { useEffect } from "react";
import "./Modal.css";

export function Modal({
  open,
  title,
  onClose,
  children,
  width = 980,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sc-backdrop" onMouseDown={onClose}>
      <div
        className="sc-modal"
        style={{ width: `min(${width}px, 96vw)` }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sc-modal__header">
          <div className="sc-modal__title">{title}</div>
          <button className="sc-btn sc-btn--ghost" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="sc-modal__body">{children}</div>
      </div>
    </div>
  );
}

