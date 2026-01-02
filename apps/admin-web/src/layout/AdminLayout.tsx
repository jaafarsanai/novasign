import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

const AdminLayout: React.FC = () => {
  return (
    <div className="flex h-screen w-screen bg-slate-100">
      {/* LEFT SIDEBAR */}
      <Sidebar />

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto py-10 px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;

