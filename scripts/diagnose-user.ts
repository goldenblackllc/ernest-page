// Run: npx tsx scripts/diagnose-user.ts
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY!;
if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}
const db = getFirestore();

const UID = '1EK5eHK2nccOUms9F0WdyouzjEi1';

function printPost(doc: FirebaseFirestore.DocumentSnapshot) {
    const d = doc.data()!;
    const created = d.created_at?.toDate?.()?.toISOString?.() || 'unknown';
    const imageCount = (d.message_images || []).filter(Boolean).length;
    const promptCount = (d.image_prompts || []).length;
    console.log(`\n  --- Post ${doc.id} ---`);
    console.log(`    created: ${created}`);
    console.log(`    title: ${d.title}`);
    console.log(`    author: ${d.author}`);
    console.log(`    status: ${d.status}`);
    console.log(`    is_public: ${d.is_public}`);
    console.log(`    visibility: ${d.visibility}`);
    console.log(`    images_complete: ${d.images_complete}`);
    console.log(`    images: ${imageCount}/${promptCount}`);
    console.log(`    image_retries: ${d.image_retries}`);
    console.log(`    image_last_error: ${d.image_last_error || 'none'}`);
    console.log(`    audio: ${!!d.audio_url}`);
    console.log(`    thumbnail: ${!!d.thumbnail_url}`);
}

async function main() {
    // 1. Check active_chats
    console.log(`\n═══ ACTIVE CHATS for ${UID} ═══`);
    const chatsSnap = await db.collection('users').doc(UID).collection('active_chats').get();
    if (chatsSnap.empty) {
        console.log('  (none — chat was deleted after processing)');
    } else {
        for (const doc of chatsSnap.docs) {
            const d = doc.data();
            console.log(`\n  --- Chat ${doc.id} ---`);
            console.log(`    isClosed: ${d.isClosed}`);
            console.log(`    processing: ${d.processing}`);
            console.log(`    processingStartedAt: ${d.processingStartedAt ? new Date(d.processingStartedAt).toISOString() : 'n/a'}`);
            console.log(`    lastError: ${d.lastError || 'none'}`);
            console.log(`    lastErrorAt: ${d.lastErrorAt ? new Date(d.lastErrorAt).toISOString() : 'n/a'}`);
            console.log(`    messages: ${(d.messages || []).length}`);
            console.log(`    sessionRouting: ${d.sessionRouting}`);
            console.log(`    createdAt: ${d.createdAt ? new Date(d.createdAt).toISOString() : 'n/a'}`);
            console.log(`    updatedAt: ${d.updatedAt ? new Date(d.updatedAt).toISOString() : 'n/a'}`);
            console.log(`    retryAfter: ${d.retryAfter ? new Date(d.retryAfter).toISOString() : 'n/a'}`);
            console.log(`    _triggerCron: ${d._triggerCron}`);
        }
    }

    // 2. Check posts by this user
    console.log(`\n═══ POSTS by ${UID} ═══`);
    const postsSnap = await db.collection('posts')
        .where('uid', '==', UID)
        .limit(10)
        .get();

    const docs = postsSnap.docs;
    if (docs.length === 0) {
        // Fallback: try authorId
        const postsSnap2 = await db.collection('posts')
            .where('authorId', '==', UID)
            .limit(10)
            .get();
        if (postsSnap2.empty) {
            console.log('  (no posts found under uid or authorId)');
        } else {
            postsSnap2.docs.forEach(printPost);
        }
    } else {
        docs.forEach(printPost);
    }

    // 3. Check active batch jobs
    console.log(`\n═══ ACTIVE BATCH JOBS ═══`);
    const batchSnap = await db.collection('batch_jobs').get();
    if (batchSnap.empty) {
        console.log('  (none)');
    } else {
        for (const doc of batchSnap.docs) {
            const d = doc.data();
            console.log(`\n  --- Batch ${doc.id} ---`);
            console.log(`    state: ${d.state}`);
            console.log(`    created_at: ${d.created_at ? new Date(d.created_at).toISOString() : 'n/a'}`);
            console.log(`    post_ids: ${JSON.stringify(d.post_ids)}`);
            console.log(`    error: ${d.error || 'none'}`);
        }
    }
}

main().catch(console.error);
