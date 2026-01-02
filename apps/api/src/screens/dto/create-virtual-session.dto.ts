import { IsOptional, IsString } from "class-validator";

export class CreateVirtualSessionDto {
  @IsOptional()
  @IsString()
  name?: string;
}

