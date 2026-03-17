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
      if (status !== "ACTIVE") return false;
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

    const trialLicense =
      allOrganizationLicenses.find((license) => {
        return String(license.licenseType ?? "").toUpperCase() === "TRIAL";
      }) ?? null;

    const trial = trialLicense
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
                Math.ceil((trialLicense.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
              )
            : null,
          timezone,
        }
      : null;

    return {
      totalQuota,
      used,
      available: Math.max(totalQuota - used, 0),
      activeLicenses: activeLicenses.length,
      timezone,
      trial,
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