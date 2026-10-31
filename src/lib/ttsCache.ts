/**
 * Penyimpanan lokal permanen (IndexedDB) untuk rekaman Suara HD di perangkat.
 *
 * Bekerja berpasangan dengan Cloudflare R2:
 * - Begitu satu klausa selesai diambil dari R2 atau dibuat dari API Gemini/ElevenLabs,
 *   blob audionya ikut disimpan di IndexedDB perangkat ini (dipisah per `userId`).
 * - Pemutaran berikutnya di perangkat yang sama berjalan 0 ms langsung dari lokal
 *   tanpa trafik jaringan dan tetap berbunyi walau tanpa API key / sedang offline.
 */

const DB_NAME = "aisherly-tts-cache-v1";
const DB_VERSION = 1;
const STORE_BLOBS = "blobs";
const STORE_META = "meta";

export const MAX_LOCAL_TTS_ENTRIES = 500;
export const MAX_LOCAL_TTS_BYTES = 80 * 1024 * 1024; // 80 MB
const MAX_SINGLE_BLOB_BYTES = 4 * 1024 * 1024; // 4 MB

type LocalMetaEntry = {
  id: string; // `${userId}:${clipHash}`
  userId: string;
  clipHash: string;
  bytes: number;
  updatedAt: number;
};

function isIdbAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openCacheDb(): Promise<IDBDatabase> {
  if (!isIdbAvailable()) {
    return Promise.reject(new Error("IndexedDB tidak tersedia."));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        const meta = db.createObjectStore(STORE_META, { keyPath: "id" });
        meta.createIndex("byUser", "userId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("Gagal membuka IndexedDB."));
    };
  });

  return dbPromise;
}

function makeRecordId(userId: string, clipHash: string): string {
  return `${userId || "anon"}:${clipHash}`;
}

export async function getLocalTtsBlob(
  userId: string,
  clipHash: string
): Promise<Blob | null> {
  if (!isIdbAvailable() || !clipHash) return null;
  try {
    const db = await openCacheDb();
    const id = makeRecordId(userId, clipHash);
    return await new Promise<Blob | null>((resolve) => {
      const tx = db.transaction(STORE_BLOBS, "readonly");
      const req = tx.objectStore(STORE_BLOBS).get(id);
      req.onsuccess = () => {
        const val = req.result;
        resolve(val instanceof Blob && val.size > 0 ? val : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function listUserMeta(db: IDBDatabase, userId: string): Promise<LocalMetaEntry[]> {
  return new Promise<LocalMetaEntry[]>((resolve) => {
    const tx = db.transaction(STORE_META, "readonly");
    const idx = tx.objectStore(STORE_META).index("byUser");
    const req = idx.getAll(userId || "anon");
    req.onsuccess = () => resolve((req.result as LocalMetaEntry[]) ?? []);
    req.onerror = () => resolve([]);
  });
}

export async function putLocalTtsBlob(
  userId: string,
  clipHash: string,
  blob: Blob
): Promise<boolean> {
  if (!isIdbAvailable() || !clipHash || !blob.size || blob.size > MAX_SINGLE_BLOB_BYTES) {
    return false;
  }
  const uid = userId || "anon";
  const id = makeRecordId(uid, clipHash);

  try {
    const db = await openCacheDb();
    const existing = await listUserMeta(db, uid);
    const others = existing
      .filter((e) => e.id !== id)
      .sort((a, b) => a.updatedAt - b.updatedAt);

    others.push({
      id,
      userId: uid,
      clipHash,
      bytes: blob.size,
      updatedAt: Date.now(),
    });

    let totalBytes = others.reduce((sum, e) => sum + e.bytes, 0);
    const droppedIds: string[] = [];
    while (others.length > MAX_LOCAL_TTS_ENTRIES || totalBytes > MAX_LOCAL_TTS_BYTES) {
      const oldest = others.shift();
      if (!oldest || oldest.id === id) break;
      totalBytes -= oldest.bytes;
      droppedIds.push(oldest.id);
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_BLOBS, STORE_META], "readwrite");
      const blobs = tx.objectStore(STORE_BLOBS);
      const meta = tx.objectStore(STORE_META);

      blobs.put(blob, id);
      meta.put({
        id,
        userId: uid,
        clipHash,
        bytes: blob.size,
        updatedAt: Date.now(),
      } satisfies LocalMetaEntry);

      for (const dropId of droppedIds) {
        blobs.delete(dropId);
        meta.delete(dropId);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Gagal menulis cache TTS lokal."));
    });

    return true;
  } catch {
    return false;
  }
}

export async function getLocalTtsStats(
  userId: string
): Promise<{ count: number; bytes: number }> {
  if (!isIdbAvailable()) return { count: 0, bytes: 0 };
  try {
    const db = await openCacheDb();
    const list = await listUserMeta(db, userId || "anon");
    return {
      count: list.length,
      bytes: list.reduce((sum, e) => sum + e.bytes, 0),
    };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

export async function removeLocalTtsBlob(userId: string, clipHash: string): Promise<void> {
  if (!isIdbAvailable() || !clipHash) return;
  try {
    const db = await openCacheDb();
    const id = makeRecordId(userId || "anon", clipHash);
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_BLOBS, STORE_META], "readwrite");
      tx.objectStore(STORE_BLOBS).delete(id);
      tx.objectStore(STORE_META).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Diabaikan.
  }
}

export async function clearLocalTtsCache(userId: string): Promise<void> {
  if (!isIdbAvailable()) return;
  try {
    const db = await openCacheDb();
    const uid = userId || "anon";
    const list = await listUserMeta(db, uid);
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_BLOBS, STORE_META], "readwrite");
      const blobs = tx.objectStore(STORE_BLOBS);
      const meta = tx.objectStore(STORE_META);
      for (const item of list) {
        blobs.delete(item.id);
        meta.delete(item.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Diabaikan.
  }
}
