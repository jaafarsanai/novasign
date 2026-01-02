import React from "react";
import PlaylistEditorPage from "./PlaylistEditorPage";

/**
 * ScreenCloud behavior:
 * - Clicking a playlist opens the editor directly.
 * - We keep this file so existing routes importing PlaylistDetailPage keep working.
 */
export default function PlaylistDetailPage() {
  return <PlaylistEditorPage />;
}

