import React from "react";
import type { Screen } from "./types";

interface ScreenTableProps {
  screens: Screen[];
  onDelete: (screen: Screen) => void;
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

const STATUS_LABELS: Record<string, { text: string; classes: string }> = {
  PAIRED: "paired" as any,
  PENDING: "pending" as any,
  OFFLINE: "offline" as any,
  ARCHIVED: "archived" as any,
};

const ScreenTable: React.FC<ScreenTableProps> = ({ screens, onDelete }) => {
  if (screens.length === 0) return null;

  const badge = (status: Screen["status"]) => {
    if (status === "PAIRED") {
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
          <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Paired
        </span>
      );
    }

    if (status === "PENDING") {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
          <span className="mr-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
          Pending
        </span>
      );
    }

    if (status === "OFFLINE") {
      return (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          <span className="mr-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
          Offline
        </span>
      );
    }

    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
        <span className="mr-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
        Archived
      </span>
    );
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Name</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Type</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Pairing Code</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Last seen</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {screens.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3 text-slate-900">{s.name || "Untitled screen"}</td>
              <td className="px-4 py-3 text-slate-500">{s.isVirtual ? "Virtual" : "Device"}</td>
              <td className="px-4 py-3 font-mono text-xs tracking-[0.25em] uppercase text-slate-700">
                {s.activePairingCode ?? "—"}
              </td>
              <td className="px-4 py-3">{badge(s.status)}</td>
              <td className="px-4 py-3 text-slate-500">{formatTime(s.lastSeenAt ?? null)}</td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onDelete(s)}
                  className="text-xs font-medium text-red-600 hover:text-red-700"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ScreenTable;