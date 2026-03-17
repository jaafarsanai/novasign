import React from "react";
import "./ScreenDrawer.css";

type ScreenModel = {
  id: string;
  name: string;
  type: "VIRTUAL" | "DEVICE";
  status: "PENDING" | "PAIRED" | "OFFLINE" | "ARCHIVED";
  lastSeenAt?: string | null;
};

interface ScreenDrawerProps {
  screen: ScreenModel | null;
  onClose: () => void;
  onRefresh?: () => void;
  onDelete?: (id: string) => void;
}

function formatLastSeen(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
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
            <strong>Last seen:</strong> {formatLastSeen(screen.lastSeenAt)}
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