import React from "react";
import "./ScreensModals.css";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="screens-modal-backdrop">
      <div className="screens-modal">
        <h2 className="screens-modal-title">{title}</h2>
        <p className="screens-modal-message">{message}</p>

        <div className="screens-modal-actions">
          <button
            type="button"
            className="screens-modal-btn screens-modal-btn-secondary"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              "screens-modal-btn " +
              (destructive
                ? "screens-modal-btn-destructive"
                : "screens-modal-btn-primary")
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

