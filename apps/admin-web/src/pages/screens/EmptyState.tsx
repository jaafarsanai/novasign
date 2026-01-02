// src/pages/screens/EmptyState.tsx
import React from "react";

interface EmptyStateProps {
  onPairClick: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({ onPairClick }) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
      <h2 className="mb-2 text-lg font-semibold text-slate-900">
        No screens added yet
      </h2>
      <p className="mb-6 max-w-md text-sm text-slate-500">
        Pair a real device or launch a virtual screen to get started.
      </p>
      <button
        type="button"
        onClick={onPairClick}
        className="rounded bg-yellow-400 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-yellow-500"
      >
        Pair a screen
      </button>
    </div>
  );
};

export default EmptyState;

