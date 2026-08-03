import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// In Cloud Functions, Application Default Credentials are provided automatically.
// No need for cert() or service account JSON.
if (!getApps().length) {
    initializeApp({
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'earnest-page.firebasestorage.app',
    });
}

export const db = getFirestore();
export const storage = getStorage();
export { FieldValue };
