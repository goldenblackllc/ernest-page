import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) });
}
const db = getFirestore();

const user = await getAuth().getUserByPhoneNumber('+11000000009');
console.log(`\nUser: uid=${user.uid}\n`);

const snap = await db.collection('posts').where('authorId', '==', user.uid).get();
console.log(`Posts: ${snap.size}`);
snap.docs.forEach(doc => {
    const d = doc.data();
    const created = d.created_at?.toDate?.()?.toISOString?.() || 'unknown';
    console.log(`  ${doc.id} | "${d.title}" | created=${created} | is_public=${d.is_public} | audio=${!!d.audio_url} | thumbnail=${!!d.thumbnail_url} | images_complete=${d.images_complete}`);
});
