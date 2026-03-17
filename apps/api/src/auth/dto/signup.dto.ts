import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class SignupDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(2)
  organizationName!: string;

  @IsString()
  @MinLength(2)
  workspaceName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}