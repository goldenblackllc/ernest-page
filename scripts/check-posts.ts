// Run from project root: npx tsx scripts/check-posts.ts
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY!;
if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}
const db = getFirestore();

async function main() {
    const posts = await db.collection('posts')
        .orderBy('created_at', 'desc')
        .limit(5)
        .get();

    for (const doc of posts.docs) {
        const d = doc.data();
        const created = d.created_at?.toDate?.()?.toISOString?.() || 'unknown';
        const imageCount = (d.message_images || []).filter(Boolean).length;
        const promptCount = (d.image_prompts || []).length;
        console.log(`\n--- Post ${doc.id} ---`);
        console.log(`  created: ${created}`);
        console.log(`  author: ${d.author}`);
        console.log(`  is_public: ${d.is_public}`);
        console.log(`  images_complete: ${d.images_complete}`);
        console.log(`  image_style: ${d.image_style}`);
        console.log(`  image_retries: ${d.image_retries}`);
        console.log(`  images: ${imageCount}/${promptCount}`);
        console.log(`  audio: ${!!d.audio_url}`);
        console.log(`  visibility: ${d.visibility}`);
    }
}

main().catch(console.error);
