// ../api/src/screens/dto/assign-content.dto.ts
import { IsIn, IsOptional, IsString } from "class-validator";

export type ScreenAssignedContentType = "PLAYLIST" | "CHANNEL" | "MEDIA";

export class AssignContentDto {
  // Allow null/undefined to clear assignment
  @IsOptional()
  @IsIn(["PLAYLIST", "CHANNEL", "MEDIA"])
  type?: ScreenAssignedContentType;

  @IsOptional()
  @IsString()
  id?: string | null;
}

