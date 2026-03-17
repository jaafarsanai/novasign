import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { WorkspacesService } from "./workspaces.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentAuth } from "../auth/current-auth.decorator";
import type { AuthContext } from "../auth/interfaces/auth-context.interface";
import { CreateWorkspaceDto } from "./dto/create-workspace.dto";
import { UpdateWorkspaceDto } from "./dto/update-workspace.dto";

@Controller("workspaces")
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext) {
    const items = await this.workspaces.list(auth);
    return { items };
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateWorkspaceDto,
  ) {
    const item = await this.workspaces.create(auth, dto);
    return { item };
  }

  @Patch(":id")
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    const item = await this.workspaces.update(auth, id, dto);
    return { item };
  }

  @Post(":id/archive")
  async archive(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
  ) {
    return this.workspaces.archive(auth, id);
  }
}