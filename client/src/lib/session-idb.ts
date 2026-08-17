/**
 * SeniorDevOps Offline Persistence Layer (IndexedDB)
 * 
 * Schema:
 * - Database: "seniordevops-offline" (v1)
 * - Object Store: "session_deltas"
 * - KeyPath: "id" (auto-increment)
 * 
 * Purpose:
 * Buffers charging session telemetry every 30 seconds to ensure no data is lost 
 * during mobile connectivity gaps. pruneOldDeltas() prevents the storage from 
 * growing indefinitely by removing records older than 24 hours.
 */

export interface SessionDelta {
  id?: number              // auto-increment IDB key
  sessionId: string        // matches Firestore booking/session doc ID
  userId: string
  timestamp: number        // Date.now()
  elapsedSecs: number
  kwhDelivered: number
  currentCost: number
  soc: number              // 0–100
  effectivePowerKw: number
  isTapered: boolean
  minsToFull: number | null
  synced: boolean          // false until confirmed written to Firestore
}

const DB_NAME = 'seniordevops-offline';
const DB_VERSION = 1;
const STORE_NAME = 'session_deltas';

/**
 * Lazily opens the IndexedDB connection.
 */
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Saves a snapshot of the current session state to IndexedDB.
 * Called every 30s by the main thread.
 */
export async function saveSessionDelta(delta: SessionDelta): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(delta);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves all unsynced deltas for a specific session, ordered by time.
 * Called upon reconnection or page visibility restoration.
 */
export async function getUnsyncedDeltas(sessionId: string): Promise<SessionDelta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result as SessionDelta[];
      const filtered = all
        .filter(d => d.sessionId === sessionId && !d.synced)
        .sort((a, b) => a.timestamp - b.timestamp);
      resolve(filtered);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Marks a batch of deltas as synced in IndexedDB.
 * Called after a successful Firestore batch write.
 */
export async function markDeltasSynced(ids: number[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);

    ids.forEach(id => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const data = getReq.result;
        if (data) {
          data.synced = true;
          store.put(data);
        }
      };
    });
  });
}

/**
 * Deletes all synced deltas older than 24 hours.
 * Housekeeping function called on session initialization.
 */
export async function pruneOldDeltas(): Promise<void> {
  const db = await openDB();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - ONE_DAY_MS;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result as SessionDelta[];
      all.forEach(d => {
        if (d.synced && d.timestamp < cutoff) {
          store.delete(d.id!);
        }
      });
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves the most recent delta for a session.
 * Used to resume session state accurately after an app crash or restart.
 */
export async function getLatestDelta(sessionId: string): Promise<SessionDelta | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result as SessionDelta[];
      const filtered = all
        .filter(d => d.sessionId === sessionId)
        .sort((a, b) => b.timestamp - a.timestamp);
      resolve(filtered.length > 0 ? filtered[0] : null);
    };
    request.onerror = () => reject(request.error);
  });
}
