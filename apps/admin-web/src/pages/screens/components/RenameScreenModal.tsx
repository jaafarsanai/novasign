import React from "react";
import "./ScreensModals.css";

interface RenameScreenModalProps {
  open: boolean;
  initialName: string;
  onCancel: () => void;
  onSave: (name: string) => void;
}

export function RenameScreenModal({
  open,
  initialName,
  onCancel,
  onSave,
}: RenameScreenModalProps) {
  const [name, setName] = React.useState(initialName);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
    }
  }, [open, initialName]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Screen name cannot be empty.");
      return;
    }
    onSave(trimmed);
  }

  return (
    <div className="screens-modal-backdrop">
      <div className="screens-modal">
        <h2 className="screens-modal-title">Rename screen</h2>

        <form onSubmit={handleSubmit}>
          <label className="screens-modal-label">
            Screen name
            <input
              autoFocus
              className="screens-modal-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          {error && <p className="screens-modal-error">{error}</p>}

          <div className="screens-modal-actions">
            <button
              type="button"
              className="screens-modal-btn screens-modal-btn-secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="screens-modal-btn screens-modal-btn-primary"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

