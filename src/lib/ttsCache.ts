/**
 * Persistent TTS audio cache using IndexedDB.
 *
 * Audio blobs are stored by message ID so they survive iOS page eviction
 * (when Safari discards background tabs to reclaim memory).  When the user
 * returns to a mirror chat after switching apps, the blob is read from
 * IndexedDB instead of re-fetching from the TTS API.
 *
 * The cache is cleared every time a mirror session is closed.
 */

const DB_NAME = 'ep-tts-cache';
const STORE_NAME = 'audio';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** Store a TTS audio blob keyed by message ID. */
export async function cacheTTSBlob(messageId: string, blob: Blob): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(blob, messageId);
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch {
        // Non-critical — worst case we re-fetch from ElevenLabs
    }
}

/** Retrieve a cached TTS audio blob by message ID. Returns null on miss. */
export async function getCachedTTSBlob(messageId: string): Promise<Blob | null> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(messageId);
        const result = await new Promise<Blob | null>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return result;
    } catch {
        return null;
    }
}

/** Wipe all cached TTS blobs (called on session close). */
export async function clearTTSCache(): Promise<void> {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
    } catch {
        // Non-critical
    }
}
