import { IsInt, IsOptional, Min } from "class-validator";

export class UpdatePlaylistItemDto {
  @IsOptional()
  @IsInt()
  @Min(1000)
  durationMs?: number;
}

