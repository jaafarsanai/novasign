// apps/api/src/channels/channels.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Patch,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type Orientation = "landscape" | "portrait";

@Controller("/channels")
export class ChannelsController {
  constructor(private readonly prisma: PrismaService) {}

@Get()
async list(@Query("search") search?: string) {
  const s = (search || "").trim();
  const items = await this.prisma.channel.findMany({
    where: s ? { name: { contains: s, mode: "insensitive" } } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      orientation: true,
      layoutId: true,
      updatedAt: true,
      createdAt: true,
    },
  });
  return { items };
}

  @Get(":id")
  async getById(@Param("id") id: string) {
    const item = await this.prisma.channel.findUnique({ where: { id } });
    return { item: item ?? null };
  }

  @Post()
  async create(@Body() dto: { name: string; orientation: Orientation }) {
    const item = await this.prisma.channel.create({
      data: {
        name: dto?.name ?? "Untitled",
        orientation: dto?.orientation ?? "landscape",
        layoutId: "default",
        zones: {}, // JSON
        transition: { enabled: false, type: "slide", duration: 0.5, direction: "right" } as any,
      },
    });
    return { item };
  }

  @Patch(":id")
  async patch(
    @Param("id") id: string,
    @Body() dto: Partial<{ name: string; orientation: Orientation; layoutId: string; zones: any; transition: any }>,
  ) {
    return this.update(id, dto);
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: Partial<{ name: string; orientation: Orientation; layoutId: string; zones: any; transition: any }>,
  ) {
    try {
      const item = await this.prisma.channel.update({
        where: { id },
        data: {
          ...dto,
          updatedAt: new Date(),
        },
      });
      return { item };
    } catch (e: any) {
      if (e?.code === "P2025") throw new NotFoundException();
      throw e;
    }
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    try {
      await this.prisma.channel.delete({ where: { id } });
      return { ok: true };
    } catch (e: any) {
      if (e?.code === "P2025") throw new NotFoundException();
      throw e;
    }
  }

  @Post(":id/duplicate")
  async duplicate(@Param("id") id: string) {
    const src = await this.prisma.channel.findUnique({ where: { id } });
    if (!src) return { item: null };

    const copy = await this.prisma.channel.create({
      data: {
        name: `${src.name} (copy)`,
        orientation: src.orientation as any,
        layoutId: src.layoutId,
        zones: src.zones as any,
        transition: src.transition as any,
      },
    });

    return { item: copy };
  }
}
