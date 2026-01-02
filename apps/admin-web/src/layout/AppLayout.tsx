import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./AppLayout.css";

const AppLayout: React.FC = () => {
  const { pathname } = useLocation();

  // Hide the global subscription bar on playlists pages (per your requirement)
  const hideSubscriptionBar = pathname.startsWith("/playlists");

  return (
    <div className="ns2-app">
      <Sidebar />

      <div className="ns2-main">
        {!hideSubscriptionBar && (
          <div className="ns2-subscription-bar">
            <span>8 days left! Activate your subscription now.</span>
            <button type="button" className="ns2-subscribe-btn">
              Subscribe Now
            </button>
          </div>
        )}

        <div className="ns2-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AppLayout;

