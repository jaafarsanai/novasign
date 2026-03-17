import { IsOptional, IsString, Length } from "class-validator";

export class PairScreenDto {
  @IsString()
  @Length(6, 6)
  code!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  name?: string;
}