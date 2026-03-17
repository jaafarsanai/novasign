import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}