import { Module } from "@nestjs/common";
import { ChannelsController } from "./channels.controller";
import { ChannelsService } from "./channels.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}