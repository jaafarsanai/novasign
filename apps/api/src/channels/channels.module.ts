import { Module } from "@nestjs/common";
import { ChannelsController } from "./channels.controller";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ChannelsController],
})
export class ChannelsModule {}
