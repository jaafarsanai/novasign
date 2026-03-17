import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import AppLayout from "./layout/AppLayout";
import LoginPage from "./pages/LoginPage";
import SettingsPage from "./pages/SettingsPage";
import { getMe } from "./lib/auth";

// Screens
import ScreensPage from "./pages/screens/ScreensPage";
import ScreenPreviewPage from "./pages/screens/ScreenPreviewPage";

// Virtual Screen
import VirtualScreenPage from "./pages/virtual-screen";

// Device player
import PlayerPage from "./pages/screens/PlayerPage";

// Playlists
import PlaylistsPage from "./pages/playlists/PlaylistsPage";
import PlaylistDetailPage from "./pages/playlists/PlaylistDetailPage";
import PlaylistEditorPage from "./pages/playlists/PlaylistEditorPage";

// Media
import MediaPage from "./pages/media/MediaPage";

// Channels
import ChannelsPage from "./pages/channels/ChannelsPage";
import ChannelEditorPage from "./pages/channels/ChannelEditorPage";

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let active = true;

    getMe().then((me) => {
      if (!active) return;
      setIsAuthed(!!me?.user?.id);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  if (!isAuthed) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function LoginOnlyWhenLoggedOut() {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let active = true;

    getMe().then((me) => {
      if (!active) return;
      setIsAuthed(!!me?.user?.id);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  if (isAuthed) {
    return <Navigate to="/screens" replace />;
  }

  return <LoginPage />;
}

export default function Router() {
  return (
    <Routes>
      <Route path="/virtual-screen" element={<VirtualScreenPage />} />
      <Route path="/virtual-screen/:id" element={<VirtualScreenPage />} />
      <Route path="/virtual-screen/runtime/:runtimeKey" element={<VirtualScreenPage />} />
      <Route path="/player/:code" element={<PlayerPage />} />

      <Route path="/login" element={<LoginOnlyWhenLoggedOut />} />

      <Route
        path="/"
        element={
          <ProtectedShell>
            <AppLayout />
          </ProtectedShell>
        }
      >
        <Route index element={<Navigate to="/screens" replace />} />

        <Route path="screens" element={<ScreensPage />} />
        <Route path="screens/:id/preview" element={<ScreenPreviewPage />} />

        <Route path="playlists" element={<PlaylistsPage />} />
        <Route path="playlists/new" element={<PlaylistEditorPage />} />
        <Route path="playlists/:id" element={<PlaylistDetailPage />} />
        <Route path="playlists/:id/edit" element={<PlaylistEditorPage />} />

        <Route path="media" element={<MediaPage />} />

        <Route path="channels" element={<ChannelsPage />} />
        <Route path="channels/:id" element={<ChannelEditorPage />} />

        <Route path="account-settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/screens" replace />} />
    </Routes>
  );
}