import React from "react";
import { useNavigate } from "react-router-dom";
import { brand } from "../../config/brand";
import LicenseNoticeBar from "../license/LicenseNoticeBar";
import "./MainLayout.css";

type MainLayoutProps = {
  children: React.ReactNode;
  activeMenu?: string;
};

const menuItems = [
  "Welcome",
  "Screens",
  "Channels",
  "Playlists",
  "Media",
  "Links",
  "Dashboards",
  "Canvas",
  "Apps",
  "Quick Post",
  "Metrics",
];

const MainLayout: React.FC<MainLayoutProps> = ({ children, activeMenu }) => {
  const navigate = useNavigate();

  const handleMenuClick = (item: string) => {
    if (item === "Screens") navigate("/screens");
    if (item === "Welcome") navigate("/");
    if (item === "Channels") navigate("/channels");
    if (item === "Playlists") navigate("/playlists");
    if (item === "Media") navigate("/media");
  };

  return (
    <div className="ns-root">
      <aside className="ns-sidebar">
        <div className="ns-sidebar-header">
          <div className="ns-sidebar-logo">
            <img
              src={brand.logoIcon}
              alt={brand.appName}
              style={{ width: 22, height: 22, objectFit: "contain" }}
            />
          </div>
          <div className="ns-sidebar-title-block">
            <div className="ns-sidebar-title">{brand.appName}</div>
            <div className="ns-sidebar-space">{brand.workspaceName}</div>
          </div>
        </div>

        <nav className="ns-sidebar-nav">
          {menuItems.map((item) => (
            <button
              key={item}
              type="button"
              className={
                "ns-sidebar-nav-item" +
                (activeMenu === item ? " ns-sidebar-nav-item-active" : "")
              }
              onClick={() => handleMenuClick(item)}
            >
              <div className="ns-sidebar-nav-icon">
                <div className="ns-sidebar-nav-icon-inner" />
              </div>
              <span>{item}</span>
            </button>
          ))}
        </nav>

        <div className="ns-sidebar-footer">
          <button className="ns-sidebar-support">Support</button>

          <div className="ns-sidebar-user-block">
            <div className="ns-sidebar-user">
              <div className="ns-sidebar-user-avatar">{brand.initials}</div>
              <div className="ns-sidebar-user-info">
                <div className="ns-sidebar-user-name">{brand.demoUserName.toLowerCase()}</div>
                <div className="ns-sidebar-user-email">{brand.demoUserEmail}</div>
              </div>
            </div>
            <div className="ns-sidebar-user-bar" />
          </div>
        </div>
      </aside>

      <div className="ns-main">
        <LicenseNoticeBar />

        <header className="ns-main-header">
          <div className="ns-main-header-left">
            <h1 className="ns-main-header-title">Screens</h1>
          </div>
          <div className="ns-main-header-right">
            <div className="ns-search-wrapper">
              <input
                type="text"
                className="ns-search-input"
                placeholder="Search Screens"
              />
            </div>
            <button type="button" className="ns-new-screen-btn">
              New Screen
            </button>
          </div>
        </header>

        <main className="ns-main-content">{children}</main>
      </div>
    </div>
  );
};

export default MainLayout;