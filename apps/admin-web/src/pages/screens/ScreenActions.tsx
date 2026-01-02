import React, { useState } from "react";
import { Screen } from "./types";
import DeleteModal from "./DeleteModal";

const API_BASE =
  import.meta.env.VITE_API_URL || "http://212.71.247.250:3000";

export default function ScreenActions({
  screen,
  reload,
  showBanner,
}: {
  screen: Screen;
  reload: () => void;
  showBanner: (msg: string) => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <div className="screen-actions">
        <button className="btn btn-ghost">Set Content</button>

        <button
          className="btn btn-ghost"
          onClick={() => alert("Refresh API coming soon")}
        >
          Refresh
        </button>

        <button className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
          Delete
        </button>
      </div>

      {deleteOpen && (
        <DeleteModal
          name={screen.name}
          onClose={() => setDeleteOpen(false)}
          onConfirm={async () => {
            const res = await fetch(`${API_BASE}/screens/${screen.id}`, {
              method: "DELETE",
            });

            if (res.ok) {
              showBanner("Screen deleted");
              reload();
            }

            setDeleteOpen(false);
          }}
        />
      )}
    </>
  );
}

