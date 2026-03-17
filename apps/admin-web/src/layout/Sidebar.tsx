import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { brand } from "../config/brand";
import { getMe, logoutRequest, type MeResponse } from "../lib/auth";
import "./Sidebar.css";

type MenuItem = {
  label: string;
  path: string;
  icon: React.ReactNode;
};

const menuItems: MenuItem[] = [
  {
    label: "Welcome",
    path: "/",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l9 8h-3v10h-5v-6H11v6H6V11H3l9-8z" />
      </svg>
    ),
  },
  {
    label: "Screens",
    path: "/screens",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h16a2 2 0 012 2v9a2 2 0 01-2 2h-6v2h3v2H7v-2h3v-2H4a2 2 0 01-2-2V7a2 2 0 012-2zm0 2v9h16V7H4z" />
      </svg>
    ),
  },
  {
    label: "Channels",
    path: "/channels",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z" />
      </svg>
    ),
  },
  {
    label: "Playlists",
    path: "/playlists",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h12v2H4V6zm0 4h12v2H4v-2zm0 4h8v2H4v-2zm14-8v9.2a3 3 0 11-2-2.83V6h2z" />
      </svg>
    ),
  },
  {
    label: "Media",
    path: "/media",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2zm0 2v10h16V7H4zm3 8l3-4 2 3 3-4 4 5H7z" />
      </svg>
    ),
  },
];

function isActivePath(currentPath: string, itemPath: string) {
  if (itemPath === "/") return currentPath === "/" || currentPath === "";
  return currentPath === itemPath || currentPath.startsWith(itemPath + "/");
}

function initialsFromUser(me: MeResponse | null) {
  const fullName = me?.user?.fullName?.trim();
  const email = me?.user?.email;

  if (fullName) {
    const parts = fullName.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() || "").join("") || brand.initials;
  }

  if (email) return email[0]?.toUpperCase() || brand.initials;
  return brand.initials;
}

function displayName(me: MeResponse | null) {
  return me?.user?.fullName?.trim() || me?.user?.email || brand.appName;
}

function displayEmail(me: MeResponse | null) {
  return me?.user?.email || "";
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;

    getMe().then((nextMe) => {
      if (!active) return;
      setMe(nextMe);
    });

    return () => {
      active = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (menuRef.current.contains(e.target as Node)) return;
      setMenuOpen(false);
    }

    if (menuOpen) {
      document.addEventListener("mousedown", onDocClick);
    }

    return () => {
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [menuOpen]);

  const workspaceLabel = useMemo(() => {
    const activeWorkspaceId = me?.auth?.activeWorkspaceId;
    const activeWorkspace = me?.workspaces?.find((w) => w.id === activeWorkspaceId);
    return activeWorkspace?.name || me?.organization?.name || "Workspace";
  }, [me]);

  async function handleLogout() {
    try {
      await logoutRequest();
      setMe(null);
    } finally {
      setMenuOpen(false);
      navigate("/login", { replace: true });
      window.location.href = "/login";
    }
  }

  function handleAccountSettings() {
    setMenuOpen(false);
    navigate("/account-settings");
  }

  return (
    <aside className="sb-shell">
      <div className="sb-top">
        <button
          type="button"
          className="sb-brand"
          onClick={() => navigate("/screens")}
          aria-label={brand.appName}
        >
          <img src={brand.logoFull} alt={brand.appName} className="sb-brand-logo" />
        </button>

        <div className="sb-workspace-box">
          <div className="sb-workspace-label">Space</div>
          <div className="sb-workspace-name">{workspaceLabel}</div>
        </div>
      </div>

      <nav className="sb-nav">
        {menuItems.map((item) => {
          const active = isActivePath(location.pathname, item.path);

          return (
            <button
              key={item.label}
              type="button"
              className={`sb-nav-item${active ? " is-active" : ""}`}
              onClick={() => navigate(item.path)}
            >
              <span className="sb-nav-icon">{item.icon}</span>
              <span className="sb-nav-text">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sb-bottom">
        <button type="button" className="sb-support-btn">
          Support
        </button>

        <div className="sb-user-wrap" ref={menuRef}>
          {menuOpen && (
            <div className="sb-user-menu">
              <button type="button" className="sb-user-menu-item" onClick={handleAccountSettings}>
                <span className="sb-user-menu-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19.14 12.94a7.43 7.43 0 000-1.88l2.03-1.58-1.92-3.32-2.39.96a7.78 7.78 0 00-1.63-.95L14.87 2h-3.74l-.36 2.17a7.78 7.78 0 00-1.63.95l-2.39-.96-1.92 3.32 2.03 1.58a7.43 7.43 0 000 1.88L2.83 14.52l1.92 3.32 2.39-.96c.5.39 1.04.71 1.63.95L11.13 22h3.74l.36-2.17c.59-.24 1.13-.56 1.63-.95l2.39.96 1.92-3.32-2.03-1.58zM13 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" />
                  </svg>
                </span>
                <span>Account Settings</span>
              </button>

              <button type="button" className="sb-user-menu-item is-danger" onClick={handleLogout}>
                <span className="sb-user-menu-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10 17l1.41-1.41L8.83 13H20v-2H8.83l2.58-2.59L10 7l-5 5 5 5zm9 2h-7v-2h7V7h-7V5h7a2 2 0 012 2v10a2 2 0 01-2 2z" />
                  </svg>
                </span>
                <span>Logout</span>
              </button>
            </div>
          )}

          <button
            type="button"
            className="sb-user-button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
          >
            <div className="sb-user-avatar">{initialsFromUser(me)}</div>

            <div className="sb-user-meta">
              <div className="sb-user-name">{displayName(me)}</div>
              <div className="sb-user-email">{displayEmail(me)}</div>
            </div>
          </button>
        </div>
      </div>
    </aside>
  );
}