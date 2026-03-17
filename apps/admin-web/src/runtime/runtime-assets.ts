import type { RuntimeManifestAsset } from "./types";
import type { VsPlaylistPayload } from "../pages/virtual-screen/VirtualScreenPage";

export function extractManifestAssetsFromPlaylist(
  playlist: VsPlaylistPayload | null | undefined,
): RuntimeManifestAsset[] {
  if (!playlist) return [];

  const map = new Map<string, RuntimeManifestAsset>();

  const add = (id: string, url: string) => {
    const key = String(id || url);
    if (!key || !url) return;
    if (!map.has(key)) {
      map.set(key, {
        id: key,
        url: String(url),
      });
    }
  };

  for (const item of playlist.items ?? []) {
    add(item.id, item.url);
  }

  const zones = playlist.channel?.zones ?? {};
  for (const value of Object.values(zones)) {
    const arr = Array.isArray(value) ? value : [];
    for (const item of arr as any[]) {
      if (item?.id && item?.url) add(String(item.id), String(item.url));
    }
  }

  return Array.from(map.values());
}

