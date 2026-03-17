import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import LicenseNoticeBar from "../components/license/LicenseNoticeBar";
import "./AppLayout.css";

const AppLayout: React.FC = () => {
  return (
    <div className="ns2-app">
      <Sidebar />

      <div className="ns2-main">
        <LicenseNoticeBar />

        <div className="ns2-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AppLayout;