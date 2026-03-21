import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { brand } from "./config/brand";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import "./theme.css";
import "./App.css";
import "./mobile.css";

registerSW({
  immediate: true,
});

try {
  const k = `${brand.key}:user`;
  if (!localStorage.getItem(k)) {
    localStorage.setItem(
      k,
      JSON.stringify({
        name: brand.demoUserName,
        email: brand.demoUserEmail,
      })
    );
  }

  document.title = brand.appName;

  let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.href = brand.favicon;

  const root = document.documentElement;
  root.style.setProperty("--brand-primary", brand.colors.primary);
  root.style.setProperty("--brand-primary-dark", brand.colors.primaryDark);
  root.style.setProperty("--brand-secondary", brand.colors.secondary);
  root.style.setProperty("--brand-sidebar-bg", brand.colors.sidebarBg);
  root.style.setProperty("--brand-sidebar-text", brand.colors.sidebarText);
  root.style.setProperty("--brand-sidebar-muted", brand.colors.sidebarMuted);
  root.style.setProperty("--brand-sidebar-active-bg", brand.colors.sidebarActiveBg);
  root.style.setProperty("--brand-sidebar-active-text", brand.colors.sidebarActiveText);
  root.style.setProperty("--brand-page-bg", brand.colors.pageBg);
  root.style.setProperty("--brand-card-bg", brand.colors.cardBg);
  root.style.setProperty("--brand-text-main", brand.colors.textMain);
  root.style.setProperty("--brand-text-sub", brand.colors.textSub);
} catch {
  // ignore
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);