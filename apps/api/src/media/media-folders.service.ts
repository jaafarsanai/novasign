import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthContext } from "../auth/interfaces/auth-context.interface";
import { isOrgAdmin } from "../auth/role-helpers";

export type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  children: FolderNode[];
};

type ScopedFolder = {
  id: string;
  name: string;
  parentId: string | null;
  organizationId: string;
  workspaceId: string | null;
  visibilityScope: "GLOBAL" | "WORKSPACE";
  ownerType: "ORGANIZATION" | "WORKSPACE";
};

@Injectable()
export class MediaFoldersService {
  constructor(private readonly prisma: PrismaService) {}

  private requireActiveWorkspaceId(auth: AuthContext): string {
    if (!auth.activeWorkspaceId) {
      throw new BadRequestException("No active workspace selected");
    }
    return auth.activeWorkspaceId;
  }

  private canAccessFolder(
    auth: AuthContext,
    folder: {
      organizationId: string;
      workspaceId: string | null;
      visibilityScope: "GLOBAL" | "WORKSPACE";
    },
  ): boolean {
    if (folder.organizationId !== auth.organizationId) return false;
    if (isOrgAdmin(auth)) return true;

    return (
      folder.visibilityScope === "GLOBAL" ||
      (folder.visibilityScope === "WORKSPACE" && folder.workspaceId === auth.activeWorkspaceId)
    );
  }

  private async getScopedFolderOrThrow(auth: AuthContext, id: string): Promise<ScopedFolder> {
    const folder = await this.prisma.mediaFolder.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        parentId: true,
        organizationId: true,
        workspaceId: true,
        visibilityScope: true,
        ownerType: true,
      },
    });

    if (!folder || folder.organizationId !== auth.organizationId) {
      throw new NotFoundException("Folder not found");
    }

    if (!this.canAccessFolder(auth, folder as any)) {
      throw new ForbiddenException("Folder is not accessible in active workspace");
    }

    return folder as ScopedFolder;
  }

  private async assertCanMutateFolder(auth: AuthContext, id: string): Promise<ScopedFolder> {
    const folder = await this.getScopedFolderOrThrow(auth, id);

    if (isOrgAdmin(auth)) return folder;

    if (folder.ownerType !== "WORKSPACE" || folder.workspaceId !== auth.activeWorkspaceId) {
      throw new ForbiddenException(
        "You cannot modify folders owned by another workspace or the organization",
      );
    }

    return folder;
  }

  private computeDescendants(
    all: Array<{ id: string; parentId: string | null }>,
    startId: string,
  ): Set<string> {
    const childrenByParent = new Map<string, string[]>();
    for (const f of all) {
      if (!f.parentId) continue;
      const arr = childrenByParent.get(f.parentId) || [];
      arr.push(f.id);
      childrenByParent.set(f.parentId, arr);
    }

    const out = new Set<string>();
    const stack = [startId];
    while (stack.length) {
      const cur = stack.pop()!;
      if (out.has(cur)) continue;
      out.add(cur);
      const kids = childrenByParent.get(cur) || [];
      for (const k of kids) stack.push(k);
    }
    return out;
  }

  async listTree(auth: AuthContext): Promise<FolderNode[]> {
    const workspaceId = this.requireActiveWorkspaceId(auth);

    const all = await this.prisma.mediaFolder.findMany({
      where: {
        organizationId: auth.organizationId,
        OR: [
          { visibilityScope: "GLOBAL" },
          { visibilityScope: "WORKSPACE", workspaceId },
        ],
      },
      orderBy: [{ createdAt: "asc" }],
      select: { id: true, name: true, parentId: true },
    });

    const byId = new Map<string, FolderNode>();
    for (const f of all) {
      byId.set(f.id, {
        id: f.id,
        name: f.name,
        parentId: f.parentId ?? null,
        children: [],
      });
    }

    const roots: FolderNode[] = [];
    for (const f of all) {
      const node = byId.get(f.id)!;
      if (!node.parentId) {
        roots.push(node);
      } else {
        const p = byId.get(node.parentId);
        if (p) p.children.push(node);
        else roots.push(node);
      }
    }

    return roots;
  }

  async create(
    auth: AuthContext,
    name: string,
    parentId?: string | null,
    visibilityScope?: "GLOBAL" | "WORKSPACE",
  ) {
    const n = String(name || "").trim();
    if (!n) throw new BadRequestException("Folder name is required");

    const requestedScope = visibilityScope ?? "WORKSPACE";
    if (!["GLOBAL", "WORKSPACE"].includes(requestedScope)) {
      throw new BadRequestException("Invalid visibilityScope");
    }

    let ownerType: "ORGANIZATION" | "WORKSPACE" = "WORKSPACE";
    let workspaceId: string | null = this.requireActiveWorkspaceId(auth);

    if (requestedScope === "GLOBAL") {
      if (!isOrgAdmin(auth)) {
        throw new ForbiddenException("Only organization admins can create global folders");
      }
      ownerType = "ORGANIZATION";
      workspaceId = null;
    }

    if (parentId) {
      const parent = await this.getScopedFolderOrThrow(auth, parentId);

      if (!isOrgAdmin(auth)) {
        if (parent.ownerType !== "WORKSPACE" || parent.workspaceId !== auth.activeWorkspaceId) {
          throw new ForbiddenException(
            "You can only create subfolders under folders owned by your active workspace",
          );
        }
      }

      ownerType = parent.ownerType;
      workspaceId = parent.workspaceId;
    }

    try {
      return await this.prisma.mediaFolder.create({
        data: {
          name: n,
          parentId: parentId || null,
          organizationId: auth.organizationId,
          workspaceId,
          visibilityScope: parentId ? undefined : requestedScope,
          ownerType,
          createdByUserId: auth.userId,
        },
        select: {
          id: true,
          name: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
          organizationId: true,
          workspaceId: true,
          visibilityScope: true,
          ownerType: true,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        throw new BadRequestException("A folder with this name already exists here");
      }
      throw e;
    }
  }

  async rename(auth: AuthContext, id: string, name: string) {
    const n = String(name || "").trim();
    if (!n) throw new BadRequestException("Folder name is required");

    await this.assertCanMutateFolder(auth, id);

    try {
      return await this.prisma.mediaFolder.update({
        where: { id },
        data: { name: n },
        select: {
          id: true,
          name: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
          organizationId: true,
          workspaceId: true,
          visibilityScope: true,
          ownerType: true,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        throw new BadRequestException("A folder with this name already exists here");
      }
      throw e;
    }
  }

  async move(auth: AuthContext, id: string, parentId: string | null) {
    const self = await this.assertCanMutateFolder(auth, id);

    if (parentId === id) {
      throw new BadRequestException("Cannot move a folder into itself");
    }

    let target: ScopedFolder | null = null;
    if (parentId) {
      target = await this.getScopedFolderOrThrow(auth, parentId);

      if (!isOrgAdmin(auth)) {
        if (target.ownerType !== "WORKSPACE" || target.workspaceId !== auth.activeWorkspaceId) {
          throw new ForbiddenException(
            "You can only move folders under folders owned by your active workspace",
          );
        }
      }
    }

    const all = await this.prisma.mediaFolder.findMany({
      where: { organizationId: auth.organizationId },
      select: { id: true, parentId: true },
    });

    const descendants = this.computeDescendants(all, id);
    if (parentId && descendants.has(parentId)) {
      throw new BadRequestException(
        "Cannot move a folder into itself or one of its descendants",
      );
    }

    try {
      const updated = await this.prisma.mediaFolder.update({
        where: { id },
        data: { parentId: parentId || null },
        select: {
          id: true,
          name: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
          organizationId: true,
          workspaceId: true,
          visibilityScope: true,
          ownerType: true,
        },
      });
      return { ok: true, item: updated };
    } catch (e: any) {
      if (e?.code === "P2002") {
        throw new BadRequestException("A folder with this name already exists here");
      }
      throw e;
    }
  }

  async delete(auth: AuthContext, id: string) {
    await this.assertCanMutateFolder(auth, id);

    const children = await this.prisma.mediaFolder.count({ where: { parentId: id } });
    if (children > 0) {
      throw new BadRequestException("Folder is not empty (has subfolders)");
    }

    const mediaCount = await this.prisma.media.count({ where: { folderId: id } });
    if (mediaCount > 0) {
      throw new BadRequestException("Folder is not empty (has media)");
    }

    await this.prisma.mediaFolder.delete({ where: { id } });
    return { ok: true };
  }
}