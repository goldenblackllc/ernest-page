// Run: node scripts/count-posts-since.mjs
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) { console.error('Missing FIREBASE_SERVICE_ACCOUNT_KEY'); process.exit(1); }
if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}
const db = getFirestore();

const SINCE = new Date('2026-09-04T00:00:00Z');

async function main() {
    const posts = await db.collection('posts')
        .where('created_at', '>=', Timestamp.fromDate(SINCE))
        .orderBy('created_at', 'asc')
        .get();

    let totalChars = 0;
    let postsWithAudio = 0;
    let postsWithoutAudio = 0;
    let totalMessages = 0;

    console.log(`\nPosts since ${SINCE.toISOString().split('T')[0]}:\n`);

    for (const doc of posts.docs) {
        const d = doc.data();
        const created = d.created_at?.toDate?.()?.toISOString?.()?.split('T')[0] || '?';
        const transcript = d.public_post?.condensed_transcript || [];
        const msgCount = transcript.length;
        const charCount = transcript.reduce((sum, m) => sum + (m.text?.length || 0), 0);

        totalMessages += msgCount;
        totalChars += charCount;

        const hasAudio = !!d.audio_url;
        if (hasAudio) postsWithAudio++; else postsWithoutAudio++;

        console.log(`  ${created}  ${doc.id.slice(0,8)}…  ${String(msgCount).padStart(2)} msgs  ${String(charCount).padStart(5)} chars  audio:${hasAudio ? '✅' : '❌'}  "${(d.title || '').slice(0, 40)}"`);
    }

    const totalPosts = posts.size;
    const days = Math.ceil((Date.now() - SINCE.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Total posts:          ${totalPosts} (over ${days} days)`);
    console.log(`Posts with audio:     ${postsWithAudio}`);
    console.log(`Posts without audio:  ${postsWithoutAudio}`);
    console.log(`Total messages:       ${totalMessages}`);
    console.log(`Total characters:     ${totalChars.toLocaleString()}`);
    console.log(`Avg chars/post:       ${totalPosts > 0 ? Math.round(totalChars / totalPosts).toLocaleString() : 0}`);
    console.log(`Avg msgs/post:        ${totalPosts > 0 ? (totalMessages / totalPosts).toFixed(1) : 0}`);
    console.log(`\nEstimated ElevenLabs credits for post audio (1 credit/char):`);
    console.log(`  Total:              ~${totalChars.toLocaleString()} credits`);
    console.log(`  Per post:           ~${totalPosts > 0 ? Math.round(totalChars / totalPosts).toLocaleString() : 0} credits`);
    console.log(`\nNote: Live Mirror Chat TTS is separate and not tracked here.`);
}

main().catch(console.error);
