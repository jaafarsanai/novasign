import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
  IsDateString,
  IsObject,
} from "class-validator";

// Keep it as "any" if schedule is flexible JSON.
// You can tighten it later.
export class PatchZoneContentItemDto {
  @IsString()
  zoneId!: string; // if you send it, otherwise remove

  @IsString()
  sourceType!: string;

  @IsString()
  sourceId!: string;

  @IsString()
  name!: string;

  @IsInt()
  order!: number;

  @IsInt()
  @Min(0)
  durationSec!: number;

  @IsOptional()
  @IsString()
  mediaType?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  schedule?: any;

 

  // and add validation if you want:
  @IsOptional()
  @IsArray()
  schedules?: any[];

    @IsOptional()
  @IsDateString()
  startAt?: string | null;

  @IsOptional()
  @IsDateString()
  endAt?: string | null;

}

export class PatchZoneContentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatchZoneContentItemDto)
  items!: PatchZoneContentItemDto[];
}
