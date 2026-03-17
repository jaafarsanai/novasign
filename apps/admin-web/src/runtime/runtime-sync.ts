import { getManifest, putManifest } from "./runtime-db";
import { prefetchMediaAsset } from "./media-resolver";
import type { CachedRuntimeManifest, RuntimeManifest } from "./types";

export async function fetchRuntimeManifest(runtimeKey: string): Promise<RuntimeManifest> {
  const res = await fetch(`/api/screens/runtime/${encodeURIComponent(runtimeKey)}/manifest`, {
    credentials: "include",
    cache: "no-cache",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch runtime manifest (${res.status})`);
  }

  return (await res.json()) as RuntimeManifest;
}

export async function syncRuntimeManifest(runtimeKey: string): Promise<CachedRuntimeManifest> {
  const manifest = await fetchRuntimeManifest(runtimeKey);

  const cached: CachedRuntimeManifest = {
    ...manifest,
    savedAt: Date.now(),
  };

  await putManifest(cached);

  await Promise.allSettled((manifest.assets ?? []).map((asset) => prefetchMediaAsset(asset)));

  return cached;
}

export async function getBestAvailableManifest(
  runtimeKey: string,
): Promise<CachedRuntimeManifest | null> {
  try {
    return await syncRuntimeManifest(runtimeKey);
  } catch {
    return await getManifest(runtimeKey);
  }
}

