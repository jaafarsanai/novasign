import { IsOptional, IsString } from "class-validator";

export class CreateVirtualSessionDto {
  @IsString()
  name!: string;
}

export class PairScreenDto {
  @IsString()
  code!: string; // the pairing code shown on virtual screen (id or short code)
}

export class AssignPlaylistDto {
  @IsOptional()
  @IsString()
  playlistId?: string | null;
}

