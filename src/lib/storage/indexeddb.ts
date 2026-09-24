import { DownloadHistoryItem, AudioFormat } from '../types';

const DB_NAME = 'audiox_db';
const DB_VERSION = 2;
const STORE_NAME = 'download_history';
const BLOB_STORE_NAME = 'audio_blobs';

/**
 * Open or upgrade the AudioX IndexedDB database.
 * Returns null if running in SSR or if IndexedDB is not supported.
 */
function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return resolve(null);
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('mediaId', 'mediaId', { unique: false });
          store.createIndex('mediaId_format', ['mediaId', 'format'], { unique: false });
          store.createIndex('completedAt', 'completedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(BLOB_STORE_NAME)) {
          db.createObjectStore(BLOB_STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.warn('IndexedDB open error:', request.error);
        resolve(null);
      };
    } catch (err) {
      console.warn('IndexedDB initialization failed:', err);
      resolve(null);
    }
  });
}

/**
 * Save a completed download record and optional audio Blob to IndexedDB for true offline listening.
 */
export async function saveDownloadToIndexedDB(item: DownloadHistoryItem, blob?: Blob): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const stores = blob ? [STORE_NAME, BLOB_STORE_NAME] : [STORE_NAME];
      const tx = db.transaction(stores, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record: DownloadHistoryItem = {
        ...item,
        mediaId: item.mediaId || item.id,
        hasAudioBlob: Boolean(blob) || item.hasAudioBlob || false,
      };
      store.put(record);

      if (blob) {
        const blobStore = tx.objectStore(BLOB_STORE_NAME);
        blobStore.put({
          id: item.id,
          blob,
          fileName: item.fileName,
          format: item.format,
          mimeType: item.format === 'mp3' ? 'audio/mpeg' : 'audio/mp4',
          savedAt: Date.now(),
        });
      }

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.warn('Failed to save download record in IndexedDB:', tx.error);
        resolve(false);
      };
    } catch (err) {
      console.warn('IndexedDB transaction failed:', err);
      resolve(false);
    }
  });
}

/**
 * Retrieve audio Blob from IndexedDB for offline playback or instant download.
 */
export async function getAudioBlobFromIndexedDB(id: string): Promise<Blob | null> {
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(BLOB_STORE_NAME)) {
        return resolve(null);
      }
      const tx = db.transaction(BLOB_STORE_NAME, 'readonly');
      const store = tx.objectStore(BLOB_STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => {
        const result = req.result;
        if (result && result.blob instanceof Blob) {
          resolve(result.blob);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Retrieve all download history records ordered by completion time.
 */
export async function getAllDownloadsFromIndexedDB(): Promise<DownloadHistoryItem[]> {
  const db = await openDB();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const items: DownloadHistoryItem[] = req.result || [];
        items.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
        resolve(items);
      };

      req.onerror = () => {
        console.warn('Failed to read downloads from IndexedDB:', req.error);
        resolve([]);
      };
    } catch (err) {
      console.warn('IndexedDB read transaction failed:', err);
      resolve([]);
    }
  });
}

/**
 * Delete a single download record and its audio blob from IndexedDB.
 */
export async function deleteDownloadFromIndexedDB(id: string): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const stores = db.objectStoreNames.contains(BLOB_STORE_NAME)
        ? [STORE_NAME, BLOB_STORE_NAME]
        : [STORE_NAME];
      const tx = db.transaction(stores, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);

      if (db.objectStoreNames.contains(BLOB_STORE_NAME)) {
        tx.objectStore(BLOB_STORE_NAME).delete(id);
      }

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Clear all records and audio blobs from IndexedDB history.
 */
export async function clearAllDownloadsFromIndexedDB(): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const stores = db.objectStoreNames.contains(BLOB_STORE_NAME)
        ? [STORE_NAME, BLOB_STORE_NAME]
        : [STORE_NAME];
      const tx = db.transaction(stores, 'readwrite');
      tx.objectStore(STORE_NAME).clear();

      if (db.objectStoreNames.contains(BLOB_STORE_NAME)) {
        tx.objectStore(BLOB_STORE_NAME).clear();
      }

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Check if a specific mediaId and format combination has been downloaded.
 */
export async function isMediaDownloadedInIndexedDB(
  mediaId: string,
  format: AudioFormat
): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('mediaId_format');
      const req = index.get([mediaId, format]);

      req.onsuccess = () => {
        resolve(!!req.result);
      };

      req.onerror = () => {
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
}
