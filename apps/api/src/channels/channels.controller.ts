// apps/api/src/channels/channels.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { ChannelsService } from "./channels.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentAuth } from "../auth/current-auth.decorator";
import type { AuthContext } from "../auth/interfaces/auth-context.interface";

type Orientation = "landscape" | "portrait";

@Controller("/channels")
@UseGuards(JwtAuthGuard)
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query("search") search?: string,
  ) {
    const items = await this.channels.list(auth, search);
    return { items };
  }

  @Get(":id")
  async getById(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    const item = await this.channels.get(auth, id);
    return { item };
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: { name: string; orientation: Orientation },
  ) {
    const item = await this.channels.create(auth, {
      name: dto?.name ?? "Untitled",
      orientation: dto?.orientation ?? "landscape",
    });
    return { item };
  }

  @Patch(":id")
  async patch(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body()
    dto: Partial<{
      name: string;
      orientation: Orientation;
      layoutId: string;
      zones: any;
      transition: any;
    }>,
  ) {
    return this.update(auth, id, dto);
  }

  @Put(":id")
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body()
    dto: Partial<{
      name: string;
      orientation: Orientation;
      layoutId: string;
      zones: any;
      transition: any;
    }>,
  ) {
    const item = await this.channels.update(auth, id, dto);
    return { item };
  }

  @Delete(":id")
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    return this.channels.remove(auth, id);
  }

  @Post(":id/duplicate")
  async duplicate(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    const item = await this.channels.duplicate(auth, id);
    return { item };
  }
}