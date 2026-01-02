import React from "react";
import "./ScreenCard.css";

export type ScreenStatus = "online" | "offline";
export type ScreenType = "physical" | "virtual";

export interface ScreenModel {
  id: string;
  name: string;
  type: ScreenType;
  status: ScreenStatus;
  lastSeen: string;
  location: string;
}

interface ScreenCardProps {
  screen: ScreenModel;
  onRequestDelete?: (id: string) => void;
}

const ScreenCard: React.FC<ScreenCardProps> = ({
  screen,
  onRequestDelete,
}) => {
  const handleDelete = () => {
    if (!onRequestDelete) return;
    onRequestDelete(screen.id);
  };

  return (
    <div className="ns-screen-card">
      <div className="ns-screen-card-header">
        <div className="ns-screen-card-name">{screen.name}</div>
        <span
          className={
            "ns-screen-card-status ns-screen-card-status-" + screen.status
          }
        >
          {screen.status === "online" ? "Online" : "Offline"}
        </span>
      </div>
      <div className="ns-screen-card-meta">
        <div>Type: {screen.type}</div>
        <div>Last seen: {screen.lastSeen}</div>
        <div>Location: {screen.location}</div>
      </div>
      {onRequestDelete && (
        <div className="ns-screen-card-actions">
          <button
            type="button"
            className="ns-screen-card-delete"
            onClick={handleDelete}
          >
            Delete screen
          </button>
        </div>
      )}
    </div>
  );
};

export default ScreenCard;

