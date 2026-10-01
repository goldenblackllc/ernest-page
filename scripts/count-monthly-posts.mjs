// Run: node scripts/count-monthly-posts.mjs
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) { console.error('Missing key'); process.exit(1); }
if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
}
const db = getFirestore();

async function countPeriod(label, start, end) {
    const q = db.collection('posts')
        .where('created_at', '>=', Timestamp.fromDate(start))
        .where('created_at', '<', Timestamp.fromDate(end))
        .orderBy('created_at', 'asc');
    const snap = await q.get();
    
    let totalChars = 0;
    let withAudio = 0;
    for (const doc of snap.docs) {
        const d = doc.data();
        const transcript = d.public_post?.condensed_transcript || [];
        totalChars += transcript.reduce((sum, m) => sum + (m.text?.length || 0), 0);
        if (d.audio_url) withAudio++;
    }
    
    console.log(`${label}:`);
    console.log(`  Posts:           ${snap.size}`);
    console.log(`  With audio:      ${withAudio}`);
    console.log(`  Total chars:     ${totalChars.toLocaleString()}`);
    console.log(`  Avg chars/post:  ${snap.size > 0 ? Math.round(totalChars / snap.size).toLocaleString() : 0}`);
    console.log(`  Est. credits:    ~${totalChars.toLocaleString()}`);
    console.log();
}

async function main() {
    // August billing cycle (approx Aug 4 - Sep 4 based on Oct 4 reset)
    await countPeriod('Aug 4 – Sep 3 (last billing cycle)',
        new Date('2026-08-04T00:00:00Z'),
        new Date('2026-09-04T00:00:00Z'));
    
    // Current cycle
    await countPeriod('Sep 4 – Sep 30 (current cycle so far)',
        new Date('2026-09-04T00:00:00Z'),
        new Date('2026-10-01T00:00:00Z'));
    
    // July baseline
    await countPeriod('Jul 4 – Aug 3 (two cycles ago)',
        new Date('2026-07-04T00:00:00Z'),
        new Date('2026-08-04T00:00:00Z'));
}

main().catch(console.error);
