import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// In Cloud Functions (and the emulator), Application Default Credentials and
// FIREBASE_CONFIG (project + default storage bucket) are provided automatically,
// and initializeApp() reads them when called without options. Local scripts
// don't have FIREBASE_CONFIG, so they name the bucket explicitly.
if (!getApps().length) {
    initializeApp(process.env.FIREBASE_CONFIG ? undefined : {
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'earnest-page.firebasestorage.app',
    });
}

export const db = getFirestore();
export const storage = getStorage();
export { FieldValue };
