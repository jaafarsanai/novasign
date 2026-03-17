import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentAuth } from "../auth/current-auth.decorator";
import type { AuthContext } from "../auth/interfaces/auth-context.interface";
import { OrganizationsService } from "./organizations.service";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";

@Controller("organizations")
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get("current")
  async getCurrent(@CurrentAuth() auth: AuthContext) {
    const item = await this.organizations.getCurrent(auth);
    return { item };
  }

  @Patch(":id")
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    const item = await this.organizations.update(auth, id, dto);
    return { item };
  }
}
