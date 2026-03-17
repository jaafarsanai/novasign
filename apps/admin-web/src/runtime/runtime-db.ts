import type {
  CachedMediaAsset,
  CachedRuntimeManifest,
  RuntimeCacheStats,
} from "./types";

const DB_NAME = "novasign-runtime-cache";
const DB_VERSION = 1;

const STORE_MANIFESTS = "manifests";
const STORE_MEDIA = "media";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_MANIFESTS)) {
        db.createObjectStore(STORE_MANIFESTS, { keyPath: "runtimeKey" });
      }

      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        const mediaStore = db.createObjectStore(STORE_MEDIA, { keyPath: "id" });
        mediaStore.createIndex("by_url", "url", { unique: false });
        mediaStore.createIndex("by_checksum", "checksum", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function putManifest(manifest: CachedRuntimeManifest): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_MANIFESTS, "readwrite");
  tx.objectStore(STORE_MANIFESTS).put(manifest);
  await txDone(tx);
  db.close();
}

export async function getManifest(runtimeKey: string): Promise<CachedRuntimeManifest | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_MANIFESTS, "readonly");
  const req = tx.objectStore(STORE_MANIFESTS).get(runtimeKey);

  const value = await new Promise<CachedRuntimeManifest | null>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as CachedRuntimeManifest) ?? null);
    req.onerror = () => reject(req.error);
  });

  db.close();
  return value;
}

export async function deleteManifest(runtimeKey: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_MANIFESTS, "readwrite");
  tx.objectStore(STORE_MANIFESTS).delete(runtimeKey);
  await txDone(tx);
  db.close();
}

export async function putMediaAsset(asset: CachedMediaAsset): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_MEDIA, "readwrite");
  tx.objectStore(STORE_MEDIA).put(asset);
  await txDone(tx);
  db.close();
}

export async function getMediaAssetById(id: string): Promise<CachedMediaAsset | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_MEDIA, "readonly");
  const req = tx.objectStore(STORE_MEDIA).get(id);

  const value = await new Promise<CachedMediaAsset | null>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as CachedMediaAsset) ?? null);
    req.onerror = () => reject(req.error);
  });

  db.close();
  return value;
}

export async function deleteMediaAsset(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_MEDIA, "readwrite");
  tx.objectStore(STORE_MEDIA).delete(id);
  await txDone(tx);
  db.close();
}

export async function listMediaAssetIds(): Promise<string[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_MEDIA, "readonly");
  const req = tx.objectStore(STORE_MEDIA).getAllKeys();

  const keys = await new Promise<string[]>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
    req.onerror = () => reject(req.error);
  });

  db.close();
  return keys;
}

export async function getRuntimeCacheStats(): Promise<RuntimeCacheStats> {
  const db = await openDb();

  const manifestsTx = db.transaction(STORE_MANIFESTS, "readonly");
  const manifestsReq = manifestsTx.objectStore(STORE_MANIFESTS).count();

  const mediaTx = db.transaction(STORE_MEDIA, "readonly");
  const mediaReq = mediaTx.objectStore(STORE_MEDIA).count();

  const manifests = await new Promise<number>((resolve, reject) => {
    manifestsReq.onsuccess = () => resolve(manifestsReq.result ?? 0);
    manifestsReq.onerror = () => reject(manifestsReq.error);
  });

  const mediaAssets = await new Promise<number>((resolve, reject) => {
    mediaReq.onsuccess = () => resolve(mediaReq.result ?? 0);
    mediaReq.onerror = () => reject(mediaReq.error);
  });

  db.close();
  return { manifests, mediaAssets };
}

