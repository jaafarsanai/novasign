import { IsString, Length, Matches } from "class-validator";

export class ClaimScreenDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^[A-Z0-9]{6}$/)
  code!: string;
}

