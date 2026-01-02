// src/types/Screen.ts
export interface Screen {
  id: string;
  name: string;
  pairingCode: string | null;
  lastSeenAt: string | null;
  status: string;
}

