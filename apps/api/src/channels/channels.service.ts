import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.channel.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        orientation: true,
        layoutId: true,
        updatedAt: true,
        createdAt: true,
      },
    });
  }

  async get(id: string) {
    const ch = await this.prisma.channel.findUnique({ where: { id: id as any } });
    if (!ch) throw new NotFoundException("Channel not found");
    return ch;
  }

  create(data: { name: string; orientation?: any; layoutId?: string }) {
    return this.prisma.channel.create({
      data: {
        name: data.name,
        orientation: data.orientation ?? "landscape",
        layoutId: data.layoutId ?? "default",
        zones: {}, // or default layout zones
      },
    });
  }
}
