// src/licenses/dto/license-summary.dto.ts
export class LicenseSummaryDto {
  planType: "trial" | "paid" | "expired" | "none";
  expiresAt: string | null;
  daysLeft: number | null;
  showBanner: boolean;
  bannerLevel: "info" | "warning" | "danger" | null;
  message: string | null;

  totalQuota: number;
  used: number;
  available: number;
  activeLicenses: number;
}