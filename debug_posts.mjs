import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { config } from 'dotenv';

config({ path: '.env.local' });

if (!getApps().length) {
    initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
    });
}
const db = getFirestore();

const ADMIN_UID = 'nTsKkFFR2rbfqohxYx1zZN6fJTZ2';

async function run() {
    // Check the specific post
    const doc = await db.collection('posts').doc('D1zKNvkjqGHrJHO8DVQS').get();
    const data = doc.data();
    console.log('=== SPECIFIC POST D1zKNvkjqGHrJHO8DVQS ===');
    console.log('uid:', data.uid);
    console.log('is admin?:', data.uid === ADMIN_UID);
    console.log('has condensed_transcript?:', !!data.condensed_transcript);
    console.log('has public_post.condensed_transcript?:', !!data.public_post?.condensed_transcript);
    console.log('has content_raw?:', !!data.content_raw);
    console.log('title:', data.title);
    console.log('keys:', Object.keys(data).sort().join(', '));
    
    // Count all posts and categorize
    console.log('\n=== POST COUNTS ===');
    const allSnap = await db.collection('posts').orderBy('created_at', 'desc').limit(100).get();
    let adminCount = 0;
    let otherCount = 0;
    let withTranscript = 0;
    let withoutTranscript = 0;
    let withContentRaw = 0;
    
    for (const d of allSnap.docs) {
        const p = d.data();
        if (p.uid === ADMIN_UID) adminCount++; else otherCount++;
        const t = p.condensed_transcript || p.public_post?.condensed_transcript;
        if (t && t.length > 0) withTranscript++; else withoutTranscript++;
        if (p.content_raw) withContentRaw++;
    }
    
    console.log(`Total: ${allSnap.docs.length}`);
    console.log(`Admin (${ADMIN_UID}): ${adminCount}`);
    console.log(`Other users: ${otherCount}`);
    console.log(`With condensed_transcript: ${withTranscript}`);
    console.log(`Without condensed_transcript: ${withoutTranscript}`);
    console.log(`With content_raw: ${withContentRaw}`);
    
    // Show a few non-admin posts without transcripts
    console.log('\n=== NON-ADMIN POSTS WITHOUT TRANSCRIPT (first 5) ===');
    let shown = 0;
    for (const d of allSnap.docs) {
        const p = d.data();
        if (p.uid === ADMIN_UID) continue;
        const t = p.condensed_transcript || p.public_post?.condensed_transcript;
        if (!t || t.length === 0) {
            console.log(`  ${d.id}: title="${p.title}", has content_raw=${!!p.content_raw}, keys: ${Object.keys(p).filter(k => k.includes('transcript') || k.includes('letter') || k.includes('response') || k.includes('condensed')).join(', ')}`);
            if (++shown >= 5) break;
        }
    }
}

run().catch(console.error);
