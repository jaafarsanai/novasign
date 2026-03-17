export type ScreenStatus = "PENDING" | "PAIRED" | "OFFLINE" | "ARCHIVED";

export interface Screen {
  id: string;
  name: string | null;

  runtimeKey: string;
  status: ScreenStatus;

  pairedAt?: string | null;
  lastSeenAt?: string | null;

  isVirtual?: boolean;

  assignedPlaylistId?: string | null;
  assignedPlaylistName?: string | null;

  assignedContentType?: "PLAYLIST" | "CHANNEL" | "MEDIA" | null;
  assignedContentId?: string | null;
  assignedContentName?: string | null;

  virtualSessionId?: string | null;
  activePairingCode?: string | null;
  orientation?: string;
}