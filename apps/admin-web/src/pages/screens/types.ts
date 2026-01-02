// src/pages/screens/types.ts

// Status values used in ScreenTable (LIVE / PENDING / maybe OFFLINE later)
export type ScreenStatus = "LIVE" | "PENDING" | "OFFLINE";

export interface Screen {
  id: string;
  name: string;

  // 6-character pairing code shown on the device
  pairingCode: string;

  // LIVE / PENDING / OFFLINE
  status: ScreenStatus;

  // ISO string or null if never seen
  lastSeenAt?: string | null;

  // true if this screen was launched as a virtual screen
  isVirtual?: boolean;
}

