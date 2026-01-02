import { Routes, Route, Navigate } from "react-router-dom";
import PlaylistsPage from "./pages/playlists/PlaylistsPage";
import PlaylistEditorPage from "./pages/playlists/PlaylistEditorPage";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/playlists" replace />} />
      <Route path="/playlists" element={<PlaylistsPage />} />
      <Route path="/playlists/:id/edit" element={<PlaylistEditorPage />} />
    </Routes>
  );
}

