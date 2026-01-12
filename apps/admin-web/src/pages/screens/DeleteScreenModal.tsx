import React from "react";
import { Modal } from "../../ui/Modal";

export default function DeleteScreenModal({
  open,
  screenName,
  isSubmitting,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  screenName: string;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} title="Delete screen" onClose={onClose} width={520}>
      <div style={{ padding: 16 }}>
        <p style={{ margin: "0 0 10px", lineHeight: 1.45 }}>
          You are about to delete <strong>{screenName}</strong>. This action cannot be undone.
        </p>

        {error && (
          <pre
            style={{
              margin: "10px 0 0",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(220, 38, 38, 0.3)",
              background: "rgba(220, 38, 38, 0.06)",
              color: "#991b1b",
              overflow: "auto",
            }}
          >
            {error}
          </pre>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
          <button type="button" className="ns2-linkbtn" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            style={{
              border: "1px solid rgba(185, 28, 28, 0.35)",
              background: "#b91c1c",
              color: "#fff",
              padding: "10px 14px",
              borderRadius: 10,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {isSubmitting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

