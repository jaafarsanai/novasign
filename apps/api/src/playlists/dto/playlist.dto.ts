import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class PlaylistItemDto {
  @IsIn(["image", "video"])
  type!: "image" | "video";

  @IsString()
  url!: string;

  // seconds (optional, mostly for images)
  @IsOptional()
  duration?: number;
}

export class CreatePlaylistDto {
  @IsString()
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaylistItemDto)
  items!: PlaylistItemDto[];
}

export class UpdatePlaylistDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlaylistItemDto)
  items?: PlaylistItemDto[];
}

