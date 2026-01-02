import React from "react";

export default function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "LIVE"
      ? "badge-live"
      : status === "PENDING"
      ? "badge-pending"
      : "badge-offline";

  return <span className={`status-badge ${cls}`}>{status}</span>;
}

