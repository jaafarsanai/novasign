import { IsString, MinLength } from "class-validator";

export class PairScreenDto {
  @IsString()
  @MinLength(3)
  code!: string;
}

