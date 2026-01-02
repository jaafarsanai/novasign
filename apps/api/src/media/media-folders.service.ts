import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  children: FolderNode[];
};

@Injectable()
export class MediaFoldersService {
  constructor(private readonly prisma: PrismaService) {}

  async listTree(): Promise<FolderNode[]> {
    const all = await this.prisma.mediaFolder.findMany({
      orderBy: [{ createdAt: "asc" }],
      select: { id: true, name: true, parentId: true },
    });

    const byId = new Map<string, FolderNode>();
    for (const f of all) {
      byId.set(f.id, { id: f.id, name: f.name, parentId: f.parentId ?? null, children: [] });
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

  async create(name: string, parentId?: string | null) {
    const n = String(name || "").trim();
    if (!n) throw new BadRequestException("Folder name is required");

    if (parentId) {
      const p = await this.prisma.mediaFolder.findUnique({ where: { id: parentId } });
      if (!p) throw new BadRequestException("Parent folder not found");
    }

    try {
      return await this.prisma.mediaFolder.create({
        data: { name: n, parentId: parentId || null },
        select: { id: true, name: true, parentId: true, createdAt: true, updatedAt: true },
      });
    } catch (e: any) {
      // Unique(parentId,name)
      if (e?.code === "P2002") throw new BadRequestException("A folder with this name already exists here");
      throw e;
    }
  }

  async rename(id: string, name: string) {
    const n = String(name || "").trim();
    if (!n) throw new BadRequestException("Folder name is required");

    try {
      return await this.prisma.mediaFolder.update({
        where: { id },
        data: { name: n },
        select: { id: true, name: true, parentId: true, createdAt: true, updatedAt: true },
      });
    } catch (e: any) {
      if (e?.code === "P2002") throw new BadRequestException("A folder with this name already exists here");
      throw e;
    }
  }

  private computeDescendants(all: Array<{ id: string; parentId: string | null }>, startId: string): Set<string> {
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

  async move(id: string, parentId: string | null) {
    const self = await this.prisma.mediaFolder.findUnique({
      where: { id },
      select: { id: true, name: true, parentId: true },
    });
    if (!self) throw new BadRequestException("Folder not found");

    if (parentId === id) throw new BadRequestException("Cannot move a folder into itself");

    if (parentId) {
      const target = await this.prisma.mediaFolder.findUnique({ where: { id: parentId }, select: { id: true } });
      if (!target) throw new BadRequestException("Target folder not found");
    }

    // prevent cycles: parentId cannot be a descendant of id
    const all = await this.prisma.mediaFolder.findMany({ select: { id: true, parentId: true } });
    const descendants = this.computeDescendants(all, id);
    if (parentId && descendants.has(parentId)) {
      throw new BadRequestException("Cannot move a folder into itself or one of its descendants");
    }

    try {
      const updated = await this.prisma.mediaFolder.update({
        where: { id },
        data: { parentId: parentId || null },
        select: { id: true, name: true, parentId: true, createdAt: true, updatedAt: true },
      });
      return { ok: true, item: updated };
    } catch (e: any) {
      if (e?.code === "P2002") throw new BadRequestException("A folder with this name already exists here");
      throw e;
    }
  }

  async delete(id: string) {
    const children = await this.prisma.mediaFolder.count({ where: { parentId: id } });
    if (children > 0) throw new BadRequestException("Folder is not empty (has subfolders)");

    const mediaCount = await this.prisma.media.count({ where: { folderId: id } });
    if (mediaCount > 0) throw new BadRequestException("Folder is not empty (has media)");

    await this.prisma.mediaFolder.delete({ where: { id } });
    return { ok: true };
  }
}

