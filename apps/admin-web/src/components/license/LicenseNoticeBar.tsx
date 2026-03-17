import React, { useEffect, useState } from "react";
import "./LicenseNoticeBar.css";

type LicenseStatusDto = {
  planType: "trial" | "paid" | "expired" | "none";
  expiresAt: string | null;
  daysLeft: number | null;
  showBanner: boolean;
  bannerLevel: "info" | "warning" | "danger" | null;
  message: string | null;
};

export default function LicenseNoticeBar() {
  const [data, setData] = useState<LicenseStatusDto | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/licenses/summary", { credentials: "include" });
        if (!res.ok) return;

        const json = (await res.json()) as LicenseStatusDto;
        if (!cancelled) setData(json);
      } catch {
        // keep silent if endpoint is not ready yet
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!data?.showBanner || !data.message) return null;

  return (
    <div className={`license-bar license-bar--${data.bannerLevel ?? "info"}`}>
      <div className="license-bar__text">{data.message}</div>

      <button
        type="button"
        className="license-bar__cta"
        onClick={() => {
          window.location.href = "/dashboard";
        }}
      >
        Manage
      </button>
    </div>
  );
}