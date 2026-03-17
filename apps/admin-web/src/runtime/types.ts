import type { VsPlaylistPayload, VsStatePayload } from "../pages/virtual-screen/VirtualScreenPage";

export type RuntimeManifestAsset = {
  id: string;
  url: string;
  checksum?: string;
  mimeType?: string;
  updatedAt?: number;
};

export type RuntimeManifest = {
  runtimeKey: string;
  screenId: string;
  updatedAt: number;
  state: VsStatePayload;
  playlist: VsPlaylistPayload;
  assets: RuntimeManifestAsset[];
};

export type CachedRuntimeManifest = RuntimeManifest & {
  savedAt: number;
};

export type CachedMediaAsset = {
  id: string;
  url: string;
  checksum?: string;
  mimeType?: string;
  updatedAt?: number;
  blob: Blob;
  savedAt: number;
};

export type RuntimeCacheStats = {
  manifests: number;
  mediaAssets: number;
};

