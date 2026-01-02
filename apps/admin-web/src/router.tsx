import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import AppLayout from "./layout/AppLayout";

// Pages
import ScreensPage from "./pages/screens/ScreensPage";
import ScreenPreviewPage from "./pages/screens/ScreenPreviewPage";
import VirtualScreenPage from "./pages/virtual-screen"; // IMPORTANT (folder)

// Playlists
import PlaylistsPage from "./pages/playlists/PlaylistsPage";
import PlaylistDetailPage from "./pages/playlists/PlaylistDetailPage";
import PlaylistEditorPage from "./pages/playlists/PlaylistEditorPage";
import MediaPage from "./pages/media/MediaPage";
import ChannelsPage from "./pages/channels/ChannelsPage";
import ChannelEditorPage from "./pages/channels/ChannelEditorPage";

export default function Router() {
  return (
    <Routes>
      {/* PUBLIC (virtual screen) - must NOT be inside AppLayout */}
      <Route path="/virtual-screen/:code" element={<VirtualScreenPage />} />

      {/* ADMIN (layout) */}
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/screens" replace />} />
	<Route path="screens/:id/preview" element={<ScreenPreviewPage />} />
        <Route path="screens" element={<ScreensPage />} />

        <Route path="playlists" element={<PlaylistsPage />} />
        <Route path="playlists/:id" element={<PlaylistDetailPage />} />
        <Route path="playlists/:id/edit" element={<PlaylistEditorPage />} />
	<Route path="/media" element={<MediaPage />} />
	<Route path="/channels" element={<ChannelsPage />} />
        <Route path="/channels/:id" element={<ChannelEditorPage />} />

        {/* Add other admin routes here */}
      </Route>

      {/* fallback */}
      <Route path="*" element={<Navigate to="/screens" replace />} />
    </Routes>
  );
}

