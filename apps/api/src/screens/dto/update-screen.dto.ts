import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateScreenDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

