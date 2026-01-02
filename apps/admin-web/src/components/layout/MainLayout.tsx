import React from "react";
import { useNavigate } from "react-router-dom";
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
    if (item === "Screens") {
      navigate("/screens");
    }
  };

  return (
    <div className="ns-root">
      {/* Sidebar */}
      <aside className="ns-sidebar">
        <div className="ns-sidebar-header">
          <div className="ns-sidebar-logo">
            <span className="ns-sidebar-logo-initial">N</span>
          </div>
          <div className="ns-sidebar-title-block">
            <div className="ns-sidebar-title">Novasign</div>
            <div className="ns-sidebar-space">
              Space <span className="ns-sidebar-space-name">Default</span>
            </div>
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
              <div className="ns-sidebar-user-avatar">J</div>
              <div className="ns-sidebar-user-info">
                <div className="ns-sidebar-user-name">jaafar</div>
                <div className="ns-sidebar-user-email">
                  sanai.jaafar@gmail.com
                </div>
              </div>
            </div>
            <div className="ns-sidebar-user-bar" />
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="ns-main">
        {/* Subscription bar */}
        <div className="ns-subscription-bar">
          <span>8 days left! Activate your subscription now.</span>
          <button type="button" className="ns-subscription-btn">
            Subscribe Now
          </button>
        </div>

        {/* Top header */}
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

        {/* Page content */}
        <main className="ns-main-content">{children}</main>
      </div>
    </div>
  );
};

export default MainLayout;

