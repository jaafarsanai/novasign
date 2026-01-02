import React from "react";
import "./DeleteScreenModal.css";

interface DeleteScreenModalProps {
  open: boolean;
  screenName: string;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  error?: string | null;
}

export default function DeleteScreenModal({
  open,
  screenName,
  onClose,
  onConfirm,
  isSubmitting,
  error,
}: DeleteScreenModalProps) {
  if (!open) return null;

  return (
    <div className="delete-modal-overlay">
      <div className="delete-modal">
        <h2>Delete screen</h2>

        <p className="delete-warning">
          Are you sure you want to delete
          <strong> {screenName || "this screen"} </strong>?
        </p>

        {error && <p className="delete-error">{error}</p>}

        <div className="delete-actions">
          <button className="cancel-btn" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>

          <button
            className="delete-btn"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Deleting…" : "Delete screen"}
          </button>
        </div>
      </div>
    </div>
  );
}

