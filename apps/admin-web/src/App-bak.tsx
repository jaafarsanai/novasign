import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AppLayout from "./layout/AppLayout";
import ScreensPage from "./pages/screens/ScreensPage";
import VirtualScreenPage from "./pages/VirtualScreenPage";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* everything uses ONE layout */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/screens" replace />} />
          <Route path="/screens" element={<ScreensPage />} />
        </Route>

        {/* virtual screen should NOT include the admin sidebar */}
        <Route path="/virtual-screen/:code" element={<VirtualScreenPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;

