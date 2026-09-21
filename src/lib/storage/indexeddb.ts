import { DownloadHistoryItem, AudioFormat } from '../types';

const DB_NAME = 'audiox_db';
const DB_VERSION = 1;
const STORE_NAME = 'download_history';

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
 * Save a completed download record to IndexedDB.
 */
export async function saveDownloadToIndexedDB(item: DownloadHistoryItem): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = {
        ...item,
        mediaId: item.mediaId || item.id,
      };
      const req = store.put(record);

      req.onsuccess = () => resolve(true);
      req.onerror = () => {
        console.warn('Failed to save download record in IndexedDB:', req.error);
        resolve(false);
      };
    } catch (err) {
      console.warn('IndexedDB transaction failed:', err);
      resolve(false);
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
 * Clear all records from IndexedDB history.
 */
export async function clearAllDownloadsFromIndexedDB(): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
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
