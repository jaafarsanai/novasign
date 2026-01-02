import React, { useEffect } from "react";
import "./ScModal.css";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
};

export default function ScModal({ open, title, onClose, children, className }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="scm-backdrop" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className={`scm-card ${className || ""}`} onMouseDown={(e) => e.stopPropagation()}>
        <button className="scm-x" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {title ? <div className="scm-title">{title}</div> : null}

        {children}
      </div>
    </div>
  );
}

