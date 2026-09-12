import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
}
const db = getFirestore();

const doc = await db.collection('users').doc('EcAq5yRcgeUMiuY9auHcjF9kHEQ2').get();
const d = doc.data();
console.log('voice:', JSON.stringify(d.voice, null, 2));
console.log('character_bible.voice_id:', d.character_bible?.voice_id);
