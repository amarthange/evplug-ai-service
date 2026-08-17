/**
 * [EVPlugFinder Cache] Session Cache Library
 * Handles offline storage for user charging sessions using IndexedDB.
 */

export interface CachedSession {
  id: string;
  userId: string;
  stationId: string;
  stationName: string;
  connectorId: string;
  status: string;
  energyDelivered: number;
  totalCost: number;
  startTime: Date;
  endTime: Date | null;
  cachedAt: Date;
}

const DB_NAME = 'evplugfinder-session-cache';
const LEGACY_DB_NAME = 'volthub-session-cache';
const DB_VERSION = 1;
const SESSIONS_STORE = 'sessions';
const META_STORE = 'meta';

let dbInstance: IDBDatabase | null = null;

/**
 * Open or retrieve the cached IndexedDB instance.
 */
export async function openSessionDB(): Promise<IDBDatabase | null> {
  if (!window.indexedDB) {
    console.warn('[EVPlugFinder Cache] IndexedDB not supported');
    return null;
  }

  if (dbInstance) return dbInstance;

  // Attempt to delete legacy DB once per app load
  if (window.indexedDB && !localStorage.getItem('evplugfinder_legacy_db_cleaned')) {
    try {
      window.indexedDB.deleteDatabase(LEGACY_DB_NAME);
      localStorage.setItem('evplugfinder_legacy_db_cleaned', 'true');
    } catch (e) {
      console.warn('[EVPlugFinder Cache] Failed to delete legacy database:', e);
    }
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Sessions store with indexes
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          const sessionStore = db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
          sessionStore.createIndex('startTime', 'startTime', { unique: false });
          sessionStore.createIndex('status', 'status', { unique: false });
        }

        // Metadata store
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = (event.target as IDBOpenDBRequest).result;
        resolve(dbInstance);
      };

      request.onerror = (err) => {
        console.error('[EVPlugFinder Cache] Database open error:', err);
        resolve(null);
      };
    } catch (err) {
      console.error('[EVPlugFinder Cache] Critical database error:', err);
      resolve(null);
    }
  });
}

/**
 * Save sessions to the cache and update last sync metadata.
 */
export async function cacheSessions(sessions: CachedSession[]): Promise<void> {
  const db = await openSessionDB();
  if (!db) return;

  try {
    const transaction = db.transaction([SESSIONS_STORE, META_STORE], 'readwrite');
    const sessionStore = transaction.objectStore(SESSIONS_STORE);
    const metaStore = transaction.objectStore(META_STORE);

    // Upsert sessions
    sessions.forEach(session => {
      sessionStore.put(session);
    });

    // Update last sync
    metaStore.put({ key: 'lastSync', syncedAt: Date.now() });

    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        console.error('[EVPlugFinder Cache] Transaction error during cache');
        resolve();
      };
    });
  } catch (err) {
    console.error('[EVPlugFinder Cache] Cache operation failed:', err);
  }
}

/**
 * Load most recent 50 sessions from cache.
 */
export async function loadCachedSessions(): Promise<CachedSession[]> {
  const db = await openSessionDB();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([SESSIONS_STORE], 'readonly');
      const store = transaction.objectStore(SESSIONS_STORE);
      const index = store.index('startTime');
      const request = index.openCursor(null, 'prev'); // Latest first
      const results: CachedSession[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor && results.length < 50) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => {
        console.error('[EVPlugFinder Cache] Load error');
        resolve([]);
      };
    } catch (err) {
      console.error('[EVPlugFinder Cache] Load operation failed:', err);
      resolve([]);
    }
  });
}

/**
 * Retrieve the timestamp of the last successful sync.
 */
export async function getLastSyncTime(): Promise<Date | null> {
  const db = await openSessionDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([META_STORE], 'readonly');
      const store = transaction.objectStore(META_STORE);
      const request = store.get('lastSync');

      request.onsuccess = () => {
        if (request.result) {
          resolve(new Date(request.result.syncedAt));
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    } catch (err) {
      resolve(null);
    }
  });
}

/**
 * Remove stale entries older than specified days.
 */
export async function clearSessionsOlderThan(days: number): Promise<void> {
  const db = await openSessionDB();
  if (!db) return;

  const threshold = Date.now() - (days * 86400000);

  try {
    const transaction = db.transaction([SESSIONS_STORE], 'readwrite');
    const store = transaction.objectStore(SESSIONS_STORE);
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const session = cursor.value as CachedSession;
        if (session.cachedAt && new Date(session.cachedAt).getTime() < threshold) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch (err) {
    console.error('[EVPlugFinder Cache] Cleanup failed:', err);
  }
}
