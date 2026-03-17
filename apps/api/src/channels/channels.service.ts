import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthContext } from "../auth/interfaces/auth-context.interface";
import { isOrgAdmin } from "../auth/role-helpers";

type Orientation = "landscape" | "portrait";

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  private requireActiveWorkspaceId(auth: AuthContext): string {
    if (!auth.activeWorkspaceId) {
      throw new BadRequestException("No active workspace selected");
    }
    return auth.activeWorkspaceId;
  }

  private async getScopedChannelOrThrow(auth: AuthContext, channelId: string) {
    const ch = await this.prisma.channel.findUnique({
      where: { id: channelId as any },
      select: {
        id: true,
        name: true,
        organizationId: true,
        workspaceId: true,
        isArchived: true,
        orientation: true,
        layoutId: true,
        zones: true,
        transition: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!ch || ch.organizationId !== auth.organizationId || ch.isArchived) {
      throw new NotFoundException("Channel not found");
    }

    if (!isOrgAdmin(auth) && ch.workspaceId !== auth.activeWorkspaceId) {
      throw new ForbiddenException("Channel is outside active workspace");
    }

    return ch;
  }

  async list(auth: AuthContext, search?: string) {
    const s = String(search || "").trim();

    const where = isOrgAdmin(auth)
      ? {
          organizationId: auth.organizationId,
          isArchived: false,
          ...(s ? { name: { contains: s, mode: "insensitive" as const } } : {}),
        }
      : {
          organizationId: auth.organizationId,
          workspaceId: this.requireActiveWorkspaceId(auth),
          isArchived: false,
          ...(s ? { name: { contains: s, mode: "insensitive" as const } } : {}),
        };

    return this.prisma.channel.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        orientation: true,
        layoutId: true,
        workspaceId: true,
        organizationId: true,
        updatedAt: true,
        createdAt: true,
      },
    });
  }

  async get(auth: AuthContext, id: string) {
    const ch = await this.getScopedChannelOrThrow(auth, id);
    return this.prisma.channel.findUnique({ where: { id: ch.id as any } });
  }

  async create(
    auth: AuthContext,
    data: { name: string; orientation?: Orientation; layoutId?: string },
  ) {
    return this.prisma.channel.create({
      data: {
        name: data.name,
        orientation: data.orientation ?? "landscape",
        layoutId: data.layoutId ?? "default",
        zones: {},
        transition: {
          enabled: false,
          type: "slide",
          duration: 0.5,
          direction: "right",
        } as any,
        organizationId: auth.organizationId,
        workspaceId: this.requireActiveWorkspaceId(auth),
        createdByUserId: auth.userId,
        isArchived: false,
      },
    });
  }

  async update(
    auth: AuthContext,
    id: string,
    dto: Partial<{
      name: string;
      orientation: Orientation;
      layoutId: string;
      zones: any;
      transition: any;
    }>,
  ) {
    await this.getScopedChannelOrThrow(auth, id);

    try {
      return await this.prisma.channel.update({
        where: { id: id as any },
        data: {
          ...dto,
          updatedAt: new Date(),
        },
      });
    } catch (e: any) {
      if (e?.code === "P2025") throw new NotFoundException("Channel not found");
      throw e;
    }
  }

  async remove(auth: AuthContext, id: string) {
    await this.getScopedChannelOrThrow(auth, id);

    try {
      await this.prisma.channel.delete({ where: { id: id as any } });
      return { ok: true };
    } catch (e: any) {
      if (e?.code === "P2025") throw new NotFoundException("Channel not found");
      throw e;
    }
  }

  async duplicate(auth: AuthContext, id: string) {
    const src = await this.getScopedChannelOrThrow(auth, id);

    const copy = await this.prisma.channel.create({
      data: {
        name: `${src.name} (copy)`,
        orientation: src.orientation as any,
        layoutId: src.layoutId,
        zones: src.zones as any,
        transition: src.transition as any,
        organizationId: auth.organizationId,
        workspaceId: this.requireActiveWorkspaceId(auth),
        createdByUserId: auth.userId,
        isArchived: false,
      },
    });

    return copy;
  }
}