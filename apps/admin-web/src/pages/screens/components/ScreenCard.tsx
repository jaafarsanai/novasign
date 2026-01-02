import React, { useState, useRef, useEffect } from "react";
import "./ScreenCard.css";
import { Screen } from "../types";

type Props = {
  screen: Screen;
  onRename: (id: string, newName: string) => Promise<void>;
  onDelete: (screen: Screen) => void;
};

export default function ScreenCard({ screen, onRename, onDelete }: Props) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState(screen.name || "");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus when entering rename mode
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  // Confirm rename
  const finishRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === screen.name) {
      setIsRenaming(false);
      return;
    }
    await onRename(screen.id, trimmed);
    setIsRenaming(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") finishRename();
    if (e.key === "Escape") {
      setName(screen.name || "");
      setIsRenaming(false);
    }
  };

  return (
    <div className="screen-card">

      {/* TV preview box */}
      <div className={`screen-preview ${screen.status.toLowerCase()}`}>
        {screen.status === "LIVE" ? (
          <div className="screen-live-preview">LIVE PREVIEW</div>
        ) : (
          <div className="screen-code">{screen.pairingCode}</div>
        )}
      </div>

      <div className="screen-footer">
        {/* NAME + INLINE RENAME */}
        {isRenaming ? (
          <input
            ref={inputRef}
            className="rename-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={finishRename}
            onKeyDown={onKeyDown}
          />
        ) : (
          <div className="screen-name" onClick={() => setIsRenaming(true)}>
            {screen.name || "Unnamed Screen"}
          </div>
        )}

        {/* STATUS PILL */}
        <div className={`status-pill status-${screen.status.toLowerCase()}`}>
          {screen.status}
        </div>

        {/* ACTION MENU */}
        <div className="card-menu">
          <button className="card-menu-btn">⋮</button>
          <div className="card-menu-dropdown">
            <div className="card-menu-item" onClick={() => setIsRenaming(true)}>
              Rename
            </div>
            <div className="card-menu-item delete" onClick={() => onDelete(screen)}>
              Delete
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

