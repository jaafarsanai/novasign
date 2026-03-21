import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { safeTimezone } from "../common/timezone.util";

@Injectable()
export class LicensesService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(organizationId: string) {
    const now = new Date();

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        timezone: true,
      },
    });

    const timezone = safeTimezone(organization?.timezone, "UTC");

    const allOrganizationLicenses = await this.prisma.license.findMany({
      where: {
        organizationId,
      },
      select: {
        id: true,
        licenseType: true,
        status: true,
        screenQuota: true,
        trialDays: true,
        startsAt: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const activeLicenses = allOrganizationLicenses.filter((license) => {
      const status = String(license.status ?? "").toUpperCase();
      if (status !== "ACTIVE" && status !== "TRIAL") return false;
      if (license.startsAt && license.startsAt > now) return false;
      if (license.expiresAt && license.expiresAt <= now) return false;
      return true;
    });

    const totalQuota = activeLicenses.reduce(
      (sum, item) => sum + (item.screenQuota ?? 0),
      0,
    );

    const used = await this.prisma.screen.count({
      where: {
        organizationId,
        pairedAt: {
          not: null,
        },
        isArchived: false,
      },
    });

    const available = Math.max(totalQuota - used, 0);

    const latestLicense = allOrganizationLicenses[0] ?? null;

    const trialLicense =
      allOrganizationLicenses.find((license) => {
        return String(license.licenseType ?? "").toUpperCase() === "TRIAL";
      }) ?? null;

    let planType: "trial" | "paid" | "expired" | "none" = "none";
    let expiresAt: string | null = null;
    let daysLeft: number | null = null;
    let showBanner = false;
    let bannerLevel: "info" | "warning" | "danger" | null = null;
    let message: string | null = null;

    if (activeLicenses.length > 0) {
      const hasActiveTrial = activeLicenses.some(
        (license) => String(license.licenseType ?? "").toUpperCase() === "TRIAL",
      );

      if (hasActiveTrial) {
        const activeTrial =
          activeLicenses.find(
            (license) => String(license.licenseType ?? "").toUpperCase() === "TRIAL",
          ) ?? null;

        planType = "trial";
        expiresAt = activeTrial?.expiresAt ? activeTrial.expiresAt.toISOString() : null;
        daysLeft = activeTrial?.expiresAt
          ? Math.max(
              0,
              Math.ceil(
                (activeTrial.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
              ),
            )
          : null;

        if ((daysLeft ?? 999) <= 3) {
          showBanner = true;
          bannerLevel = "warning";
          message =
            daysLeft === 0
              ? "Your trial expires today. Renew or upgrade your subscription to avoid interruption."
              : `Your trial expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Renew or upgrade your subscription.`;
        }
      } else {
        planType = "paid";
        const nearestExpiry = activeLicenses
          .map((license) => license.expiresAt)
          .filter((d): d is Date => !!d)
          .sort((a, b) => a.getTime() - b.getTime())[0];

        expiresAt = nearestExpiry ? nearestExpiry.toISOString() : null;
        daysLeft = nearestExpiry
          ? Math.max(
              0,
              Math.ceil((nearestExpiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
            )
          : null;
      }
    } else if (trialLicense && trialLicense.expiresAt && trialLicense.expiresAt <= now) {
      planType = "expired";
      expiresAt = trialLicense.expiresAt.toISOString();
      daysLeft = 0;
      showBanner = true;
      bannerLevel = "danger";
      message =
        "Your trial has expired. Renew or upgrade your subscription to pair screens and continue using licensed features.";
    } else if (latestLicense) {
      planType = "expired";
      expiresAt = latestLicense.expiresAt ? latestLicense.expiresAt.toISOString() : null;
      daysLeft = latestLicense.expiresAt
        ? Math.max(
            0,
            Math.ceil((latestLicense.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
          )
        : null;
      showBanner = true;
      bannerLevel = "danger";
      message =
        "No active license. Renew or upgrade your subscription to pair screens and continue using licensed features.";
    } else {
      planType = "none";
      showBanner = true;
      bannerLevel = "danger";
      message =
        "No subscription found. Start a trial or upgrade your subscription to pair screens.";
    }

    return {
      planType,
      expiresAt,
      daysLeft,
      showBanner,
      bannerLevel,
      message,
      totalQuota,
      used,
      available,
      activeLicenses: activeLicenses.length,
      timezone,
      trial: trialLicense
        ? {
            isTrial: true,
            status: trialLicense.status,
            startsAt: trialLicense.startsAt,
            expiresAt: trialLicense.expiresAt,
            trialDays: trialLicense.trialDays ?? 7,
            screenQuota: trialLicense.screenQuota ?? 0,
            isExpired: trialLicense.expiresAt ? trialLicense.expiresAt <= now : false,
            daysRemaining: trialLicense.expiresAt
              ? Math.max(
                  0,
                  Math.ceil(
                    (trialLicense.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
                  ),
                )
              : null,
            timezone,
            used,
          }
        : null,
      licenses: activeLicenses.map((license) => ({
        id: license.id,
        licenseType: license.licenseType,
        status: license.status,
        screenQuota: license.screenQuota ?? 0,
        trialDays: license.trialDays,
        startsAt: license.startsAt,
        expiresAt: license.expiresAt,
      })),
    };
  }
}