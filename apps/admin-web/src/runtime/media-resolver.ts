import { getMediaAssetById, putMediaAsset } from "./runtime-db";
import type { RuntimeManifestAsset } from "./types";

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-cache",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch media: ${url} (${res.status})`);
  }

  return await res.blob();
}

export async function resolveMediaUrl(asset: RuntimeManifestAsset): Promise<string> {
  const cached = await getMediaAssetById(asset.id);

  if (
    cached &&
    cached.blob &&
    (!asset.checksum || !cached.checksum || cached.checksum === asset.checksum)
  ) {
    return URL.createObjectURL(cached.blob);
  }

  const blob = await fetchBlob(asset.url);

  await putMediaAsset({
    id: asset.id,
    url: asset.url,
    checksum: asset.checksum,
    mimeType: asset.mimeType,
    updatedAt: asset.updatedAt,
    blob,
    savedAt: Date.now(),
  });

  return URL.createObjectURL(blob);
}

export async function prefetchMediaAsset(asset: RuntimeManifestAsset): Promise<void> {
  const cached = await getMediaAssetById(asset.id);

  if (
    cached &&
    cached.blob &&
    (!asset.checksum || !cached.checksum || cached.checksum === asset.checksum)
  ) {
    return;
  }

  const blob = await fetchBlob(asset.url);

  await putMediaAsset({
    id: asset.id,
    url: asset.url,
    checksum: asset.checksum,
    mimeType: asset.mimeType,
    updatedAt: asset.updatedAt,
    blob,
    savedAt: Date.now(),
  });
}

