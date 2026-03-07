export type BrandKey = "novasign" | "pulsepanels";

export type BrandConfig = {
  key: BrandKey;
  appName: string;
  studioName: string;
  workspaceName: string;
  logoFull: string;
  logoIcon: string;
  favicon: string;
  initials: string;
  supportEmail: string;
  demoUserName: string;
  demoUserEmail: string;
  loginDemoEmail: string;
  loginDemoPassword: string;
  colors: {
    primary: string;
    primaryDark: string;
    secondary: string;
    sidebarBg: string;
    sidebarText: string;
    sidebarMuted: string;
    sidebarActiveBg: string;
    sidebarActiveText: string;
    pageBg: string;
    cardBg: string;
    textMain: string;
    textSub: string;
  };
};

const envBrand = ((import.meta.env.VITE_BRAND as BrandKey | undefined) || "pulsepanels").toLowerCase() as BrandKey;

const brands: Record<BrandKey, BrandConfig> = {
  novasign: {
    key: "novasign",
    appName: "NovaSign",
    studioName: "Studio",
    workspaceName: "Default workspace",
    logoFull: "/branding/novasign/logo-full.svg",
    logoIcon: "/branding/novasign/logo-icon.svg",
    favicon: "/branding/novasign/favicon.ico",
    initials: "N",
    supportEmail: "admin@technoserve.net",
    demoUserName: "Jaafar",
    demoUserEmail: "admin@technoserve.net",
    loginDemoEmail: "admin@novasign.com",
    loginDemoPassword: "novasign123",
    colors: {
      primary: "#facc15",
      primaryDark: "#eab308",
      secondary: "#111827",
      sidebarBg: "#050816",
      sidebarText: "#e5e7eb",
      sidebarMuted: "#9ca3af",
      sidebarActiveBg: "#facc15",
      sidebarActiveText: "#111827",
      pageBg: "#f5f7fb",
      cardBg: "#ffffff",
      textMain: "#111827",
      textSub: "#6b7280",
    },
  },

  pulsepanels: {
    key: "pulsepanels",
    appName: "PulsePanels",
    studioName: "Cloud Signage",
    workspaceName: "Default workspace",
    logoFull: "/branding/pulsepanels/logo-full.svg",
    logoIcon: "/branding/pulsepanels/logo-icon.svg",
    favicon: "/branding/pulsepanels/favicon.ico",
    initials: "P",
    supportEmail: "support@pulsepanels.com",
    demoUserName: "Jaafar",
    demoUserEmail: "admin@pulsepanels.com",
    loginDemoEmail: "admin@pulsepanels.com",
    loginDemoPassword: "pulsepanels123",
    colors: {
      primary: "#1DA1F2",
      primaryDark: "#1689CF",
      secondary: "#0A2342",
      sidebarBg: "#071426",
      sidebarText: "#EAF4FF",
      sidebarMuted: "#9AB3C9",
      sidebarActiveBg: "#1DA1F2",
      sidebarActiveText: "#FFFFFF",
      pageBg: "#F4F7FB",
      cardBg: "#FFFFFF",
      textMain: "#0A2342",
      textSub: "#5F7288",
    },
  },
};

export const brand = brands[envBrand] || brands.pulsepanels;
