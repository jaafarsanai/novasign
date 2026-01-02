import { IsArray, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class PlaylistItemInputDto {
  // Option A: reference existing Media by id
  @IsOptional()
  @IsString()
  mediaId?: string;

  // Option B: create/find Media from url/type (used by your current UI)
  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsIn(["image", "video"])
  type?: "image" | "video";

  // UI uses "duration" (seconds). DB is `duration Int?` -> we store seconds.
  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreatePlaylistDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaylistItemInputDto)
  items?: PlaylistItemInputDto[];
}

export class UpdatePlaylistDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaylistItemInputDto)
  items?: PlaylistItemInputDto[];
}

