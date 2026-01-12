import React from "react";
import { Modal } from "../../ui/Modal";

export default function DeleteConfirmModal({
  open,
  name,
  onClose,
  onConfirm,
  isSubmitting,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
}) {
  return (
    <Modal open={open} title="Delete screen" onClose={onClose} width={520}>
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          Are you sure you want to delete <span style={{ color: "#111827" }}>{name}</span>?
        </div>

        <div style={{ opacity: 0.8, lineHeight: 1.5 }}>
          This action cannot be undone. If this is a paired device, you will need to pair it again.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button className="sc-btn sc-btn--ghost" onClick={onClose} disabled={!!isSubmitting}>
            Cancel
          </button>

          <button
            className="sc-btn sc-btn--danger"
            onClick={onConfirm}
            disabled={!!isSubmitting}
            style={{
              border: "1px solid rgba(185,28,28,0.25)",
              background: "#b91c1c",
              color: "#fff",
              padding: "10px 14px",
              borderRadius: 10,
              fontWeight: 800,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

