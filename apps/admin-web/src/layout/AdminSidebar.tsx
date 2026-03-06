import React from "react";
import { NavLink } from "react-router-dom";
import {
  Monitor,
  Layers,
  PlaySquare,
  Image as ImageIcon,
  Settings,
  HelpCircle,
  Home,
  LayoutList,
} from "lucide-react";
import { brand } from "../config/brand";
import "./AdminSidebar.css";

export default function AdminSidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img
            src={brand.logoIcon}
            alt={brand.appName}
            style={{ width: 20, height: 20, objectFit: "contain" }}
          />
        </div>
        <div>
          <div className="sidebar-title">{brand.appName}</div>
          <div className="sidebar-subtitle">{brand.workspaceName}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section">Dashboard</div>
        <NavItem to="/welcome" icon={<Home size={18} />} label="Welcome" />

        <div className="sidebar-section">Screens</div>
        <NavItem to="/screens" icon={<Monitor size={18} />} label="Screens" />
        <NavItem to="/channels" icon={<LayoutList size={18} />} label="Channels" />

        <div className="sidebar-section">Content</div>
        <NavItem to="/playlists" icon={<PlaySquare size={18} />} label="Playlists" />
        <NavItem to="/media" icon={<ImageIcon size={18} />} label="Media" />
        <NavItem to="/apps" icon={<Layers size={18} />} label="Apps" />

        <div className="sidebar-section">Management</div>
        <NavItem to="/settings" icon={<Settings size={18} />} label="Settings" />
      </nav>

      <div className="sidebar-footer">
        <button className="support-btn">
          <HelpCircle size={16} />
          Support
        </button>

        <div className="sidebar-user">
          <div className="sidebar-avatar">{brand.initials}</div>
          <div>
            <div className="sidebar-user-name">{brand.demoUserName}</div>
            <div className="sidebar-user-email">{brand.demoUserEmail}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}