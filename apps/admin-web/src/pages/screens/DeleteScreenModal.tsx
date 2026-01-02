import React from "react";
import "./PairModal.css"; // keep styling consistent
import type { Screen } from "./types";

export interface DeleteScreenModalProps {
  open: boolean;                 // <-- ADD THIS
  screen: Screen | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}

export const DeleteScreenModal: React.FC<DeleteScreenModalProps> = ({
  open,
  screen,
  onClose,
  onConfirm,
  isSubmitting,
  error
}) => {
  if (!open || !screen) return null;

  return (
    <div className="pair-modal-overlay">
      <div className="pair-modal">
        <h2 className="pair-modal-title">Delete Screen</h2>

        <p className="pair-modal-text">
          Are you sure you want to remove <strong>{screen.name}</strong>?
        </p>

        {error && <p className="pair-modal-error">{error}</p>}

        <div className="pair-modal-actions">
          <button className="pair-btn-cancel" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>

          <button className="pair-btn-primary" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Removing..." : "Delete screen"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteScreenModal;

