import React from "react";
import { NavLink } from "react-router-dom";
import "./Sidebar.css";

type Item = {
  label: string;
  to: string;
  icon: React.ReactNode;
};

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="sb-icon">{children}</span>;
}

const items: Item[] = [
  {
    label: "Welcome",
    to: "/",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path
            d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </Icon>
    ),
  },
  {
    label: "Screens",
    to: "/screens",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path
            d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M8 21h8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </Icon>
    ),
  },
  {
    label: "Channels",
    to: "/channels",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path
            d="M4 7h16M4 12h16M4 17h10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </Icon>
    ),
  },
  {
    label: "Playlists",
    to: "/playlists",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path
            d="M4 6h12M4 10h12M4 14h8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M18 10v8a2 2 0 1 1-2-2h2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </Icon>
    ),
  },
  {
    label: "Media",
    to: "/media",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path
            d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M9 10l6 4-6 4v-8Z"
            fill="currentColor"
          />
        </svg>
      </Icon>
    ),
  },
  {
    label: "Links",
    to: "/links",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path
            d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </Icon>
    ),
  },
  {
    label: "Dashboards",
    to: "/dashboards",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path
            d="M4 13h7v7H4v-7Zm9-9h7v16h-7V4ZM4 4h7v7H4V4Z"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </Icon>
    ),
  },
  {
    label: "Canvas",
    to: "/canvas",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path
            d="M4 7h16M7 4v16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M7 7h13v13H7V7Z"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </Icon>
    ),
  },
  {
    label: "Apps",
    to: "/apps",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path
            d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </Icon>
    ),
  },
  {
    label: "Quick Post",
    to: "/quick-post",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </Icon>
    ),
  },
  {
    label: "Metrics",
    to: "/metrics",
    icon: (
      <Icon>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
          <path
            d="M5 19V9m7 10V5m7 14v-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </Icon>
    ),
  },
];

export default function Sidebar() {
  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-brand-badge">N</div>
        <div className="sb-brand-text">
          <div className="sb-brand-name">Novasign</div>
          <div className="sb-brand-space">Space Default</div>
        </div>
      </div>

      <nav className="sb-nav">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) => "sb-item" + (isActive ? " sb-item--active" : "")}
          >
            {it.icon}
            <span className="sb-label">{it.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sb-footer">
        <button className="sb-support">Support</button>

        <div className="sb-user">
          <div className="sb-user-avatar">J</div>
          <div className="sb-user-meta">
            <div className="sb-user-name">jaafer</div>
            <div className="sb-user-email">admin@technoserve.net</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

