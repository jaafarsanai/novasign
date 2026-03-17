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
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  private assertCanManageWorkspaces(auth: AuthContext) {
    if (
      auth.organizationRole !== "ORG_OWNER" &&
      auth.organizationRole !== "ORG_ADMIN"
    ) {
      throw new ForbiddenException("You do not have permission to manage workspaces");
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

  private async generateUniqueSlug(organizationId: string, name: string): Promise<string> {
    const base = this.slugify(name) || "workspace";

    let candidate = base;
    let i = 1;

    while (true) {
      const exists = await this.prisma.workspace.findUnique({
        where: {
          organizationId_slug: {
            organizationId,
            slug: candidate,
          },
        },
        select: { id: true },
      });

      if (!exists) return candidate;

      i += 1;
      candidate = `${base}-${i}`;
    }
  }

  private async getWorkspaceOrThrow(auth: AuthContext, workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        slug: true,
        status: true,
        description: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!workspace || workspace.organizationId !== auth.organizationId) {
      throw new NotFoundException("Workspace not found");
    }

    return workspace;
  }

  async list(auth: AuthContext) {
    return this.prisma.workspace.findMany({
      where: {
        organizationId: auth.organizationId,
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        description: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            memberships: true,
            screens: true,
            playlists: true,
            channels: true,
            media: true,
          },
        },
      },
    });
  }

  async create(
    auth: AuthContext,
    dto: { name: string; description?: string; timezone?: string },
  ) {
    this.assertCanManageWorkspaces(auth);

    const name = String(dto.name || "").trim();
    if (!name) {
      throw new BadRequestException("Workspace name is required");
    }

    const slug = await this.generateUniqueSlug(auth.organizationId, name);
    const timezone = safeTimezone(String(dto.timezone || "").trim(), "UTC");

    try {
      return await this.prisma.workspace.create({
        data: {
          organizationId: auth.organizationId,
          name,
          slug,
          description: dto.description?.trim() || null,
          timezone,
          status: "ACTIVE",
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          description: true,
          timezone: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        throw new BadRequestException("A workspace with this name or slug already exists");
      }
      throw e;
    }
  }

  async update(
    auth: AuthContext,
    workspaceId: string,
    dto: { name?: string; description?: string; timezone?: string },
  ) {
    this.assertCanManageWorkspaces(auth);

    const existing = await this.getWorkspaceOrThrow(auth, workspaceId);

    const nextName = dto.name != null ? String(dto.name).trim() : existing.name;
    const nextDescription =
      dto.description != null ? String(dto.description).trim() || null : existing.description;
    const nextTimezone =
      dto.timezone != null
        ? safeTimezone(String(dto.timezone).trim(), "UTC")
        : existing.timezone;

    if (!nextName) {
      throw new BadRequestException("Workspace name is required");
    }

    let nextSlug = existing.slug;
    if (nextName !== existing.name) {
      nextSlug = await this.generateUniqueSlug(auth.organizationId, nextName);
    }

    try {
      return await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          name: nextName,
          slug: nextSlug,
          description: nextDescription,
          timezone: nextTimezone,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          description: true,
          timezone: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        throw new BadRequestException("A workspace with this name or slug already exists");
      }
      throw e;
    }
  }

  async archive(auth: AuthContext, workspaceId: string) {
    this.assertCanManageWorkspaces(auth);

    const existing = await this.getWorkspaceOrThrow(auth, workspaceId);

    if (existing.status === "ARCHIVED") {
      return { ok: true, alreadyArchived: true };
    }

    if (auth.activeWorkspaceId === workspaceId) {
      throw new BadRequestException("You cannot archive your currently active workspace");
    }

    const orgWorkspaceCount = await this.prisma.workspace.count({
      where: {
        organizationId: auth.organizationId,
        status: "ACTIVE",
      },
    });

    if (orgWorkspaceCount <= 1) {
      throw new BadRequestException("At least one active workspace must remain");
    }

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        status: "ARCHIVED",
      },
    });

    return { ok: true };
  }
}