import { IsOptional, IsString, MinLength } from "class-validator";

export class PairScreenDto {
  @IsString()
  @MinLength(3)
  code!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  name?: string;
}