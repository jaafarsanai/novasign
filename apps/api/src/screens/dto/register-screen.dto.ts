import { IsBoolean, IsOptional, IsString, Length } from "class-validator";

export class RegisterScreenDto {
  @IsString()
  @Length(6, 6)
  code!: string;

  @IsOptional()
  @IsBoolean()
  isVirtual?: boolean;

  @IsOptional()
  @IsString()
  name?: string;
}

