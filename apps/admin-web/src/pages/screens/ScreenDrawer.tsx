import React from "react";
import "./ScreenDrawer.css";
import { ScreenModel } from "./ScreenCard";

interface ScreenDrawerProps {
  screen: ScreenModel | null;
  onClose: () => void;
  onRefresh?: () => void;
  onDelete?: (id: string) => void;
}

const ScreenDrawer: React.FC<ScreenDrawerProps> = ({
  screen,
  onClose,
  onRefresh,
  onDelete,
}) => {
  if (!screen) return null;

  const handleDelete = () => {
    if (!onDelete) return;
    onDelete(screen.id);
  };

  return (
    <div className="ns-screen-drawer-backdrop">
      <div className="ns-screen-drawer">
        <div className="ns-screen-drawer-header">
          <h2>{screen.name}</h2>
          <button
            type="button"
            className="ns-screen-drawer-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="ns-screen-drawer-body">
          <p>
            <strong>Status:</strong> {screen.status}
          </p>
          <p>
            <strong>Type:</strong> {screen.type}
          </p>
          <p>
            <strong>Last seen:</strong> {screen.lastSeen}
          </p>
          <p>
            <strong>Location:</strong> {screen.location}
          </p>
        </div>

        <div className="ns-screen-drawer-footer">
          {onRefresh && (
            <button
              type="button"
              className="ns-screen-drawer-secondary-btn"
              onClick={onRefresh}
            >
              Refresh
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="ns-screen-drawer-danger-btn"
              onClick={handleDelete}
            >
              Delete screen
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScreenDrawer;

