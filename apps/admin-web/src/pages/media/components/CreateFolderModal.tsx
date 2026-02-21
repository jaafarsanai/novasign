import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import "./CreateFolderModal.css";

type Props = {
  open: boolean;
  title?: string;
  parentName?: string | null;
  defaultName?: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (name: string) => void | Promise<void>;
};

export default function CreateFolderModal({
  open,
  title = "New folder",
  parentName,
  defaultName = "",
  busy,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
  }, [open, defaultName]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") {
        e.preventDefault();
        void submit();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, name]);

  const canSubmit = useMemo(() => {
    const n = name.trim();
    return n.length > 0 && !busy;
  }, [name, busy]);

  async function submit() {
    if (!canSubmit) return;
    await onSubmit(name.trim());
  }

  if (!open) return null;

  return (
    <div className="ns2-cfm-backdrop" onMouseDown={onClose}>
      <div className="ns2-cfm-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ns2-cfm-header">
          <div>
            <div className="ns2-cfm-title">{title}</div>
            {parentName ? <div className="ns2-cfm-sub">Parent: {parentName}</div> : null}
          </div>

          <button className="ns2-cfm-x" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="ns2-cfm-body">
          <label className="ns2-cfm-label">Folder name</label>
          <input
            className="ns2-cfm-input"
            value={name}
            disabled={busy}
            autoFocus
            placeholder="e.g. Marketing"
            onChange={(e) => setName(e.target.value)}
          />

          {error ? <div className="ns2-cfm-error">{error}</div> : null}
        </div>

        <div className="ns2-cfm-footer">
          <button className="ns2-linkbtn" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>

          <button className="ns2-primarybtn" type="button" disabled={!canSubmit} onClick={submit}>
            {busy ? "Creating…" : "Create folder"}
          </button>
        </div>
      </div>
    </div>
  );
}
