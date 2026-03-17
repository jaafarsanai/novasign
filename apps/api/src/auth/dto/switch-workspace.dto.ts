// src/auth/dto/switch-workspace.dto.ts
import { IsString, MinLength } from 'class-validator';

export class SwitchWorkspaceDto {
  @IsString()
  @MinLength(1)
  workspaceId: string;
}
