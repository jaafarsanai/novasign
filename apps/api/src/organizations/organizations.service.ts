import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthContext } from "../auth/interfaces/auth-context.interface";
import { safeTimezone } from "../common/timezone.util";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertCanManageOrganization(auth: AuthContext) {
    if (
      auth.organizationRole !== "ORG_OWNER" &&
      auth.organizationRole !== "ORG_ADMIN"
    ) {
      throw new ForbiddenException("You do not have permission to manage organization settings");
    }
  }

  private slugify(name: string): string {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 80);
  }

  private async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = this.slugify(name) || "organization";
    let candidate = base;
    let i = 1;

    while (true) {
      const exists = await this.prisma.organization.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!exists || exists.id === excludeId) return candidate;

      i += 1;
      candidate = `${base}-${i}`;
    }
  }

  async getCurrent(auth: AuthContext) {
    const item = await this.prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!item) {
      throw new NotFoundException("Organization not found");
    }

    return item;
  }

  async update(
    auth: AuthContext,
    organizationId: string,
    dto: { name?: string; timezone?: string },
  ) {
    this.assertCanManageOrganization(auth);

    if (organizationId !== auth.organizationId) {
      throw new ForbiddenException("You cannot update another organization");
    }

    const existing = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        isActive: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("Organization not found");
    }

    const nextName = dto.name != null ? String(dto.name).trim() : existing.name;
    const nextTimezone =
      dto.timezone != null
        ? safeTimezone(String(dto.timezone).trim(), "UTC")
        : existing.timezone;

    if (!nextName) {
      throw new BadRequestException("Organization name is required");
    }

    const nextSlug =
      nextName === existing.name
        ? existing.slug
        : await this.generateUniqueSlug(nextName, existing.id);

    try {
      return await this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          name: nextName,
          slug: nextSlug,
          timezone: nextTimezone,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          timezone: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        throw new BadRequestException("An organization with this name or slug already exists");
      }
      throw e;
    }
  }
}
