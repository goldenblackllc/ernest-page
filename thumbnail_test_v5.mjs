/**
 * Thumbnail Test v5 — Elevated YouTube. Specific quality markers.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { config } from 'dotenv';
import { writeFileSync, mkdirSync } from 'fs';
import sharp from 'sharp';

config({ path: '.env.local' });

if (!getApps().length) {
    initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
        storageBucket: 'earnest-page.firebasestorage.app',
    });
}
const db = getFirestore();
const storage = getStorage();

const ADMIN_UID = 'nTsKkFFR2rbfqohxYx1zZN6fJTZ2';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const MODEL = 'gemini-3.1-flash-image';
const OUTPUT_DIR = './thumbnail_samples_v5';
const NUM_SAMPLES = 5;
const ONE_WEEK_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

mkdirSync(OUTPUT_DIR, { recursive: true });

async function loadReferenceImage(uid) {
    const bucket = storage.bucket();
    for (const fileName of [`avatars/${uid}_reference.jpg`, `avatars/${uid}.jpg`]) {
        try {
            const file = bucket.file(fileName);
            const [exists] = await file.exists();
            if (!exists) continue;
            const [buffer] = await file.download();
            console.log(`     📷 Reference loaded`);
            return buffer;
        } catch { /* continue */ }
    }
    return null;
}

async function generateThumbnail(transcript, referenceImageBuffer) {
    const parts = [];

    if (referenceImageBuffer) {
        parts.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: referenceImageBuffer.toString('base64'),
            },
        });
    }

    const refNote = referenceImageBuffer
        ? 'Use the reference image for the character\'s face and identity.\n\n'
        : '';

    parts.push({
        text: `${refNote}Here is a conversation transcript from an advice column. Generate a thumbnail image for it.

The thumbnail should match the emotional tone of the conversation. The image, text, colors, and typography should all reflect the mood.

Quality guidelines — think elevated YouTube, not clickbait:
- Short hook text: 5-8 words max. A question or insight, not drama. Make someone think, not react.
- Clean composition with breathing room and negative space. The face shouldn't be crammed edge-to-edge.
- No arrows, no emojis, no badges, no split-screen collages.
- The scene should communicate the subject matter — a viewer should be able to tell what this conversation is about at a glance.

${transcript}`
    });

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: { responseModalities: ['IMAGE'] },
            }),
        }
    );

    if (!res.ok) {
        const errText = await res.text().catch(() => '(unreadable)');
        throw new Error(`API error ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const responseParts = data.candidates?.[0]?.content?.parts;
    if (!responseParts?.length) throw new Error('No parts in response');

    const imagePart = responseParts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imagePart) {
        const textPart = responseParts.find(p => p.text);
        throw new Error(`No image returned${textPart ? ': ' + textPart.text.slice(0, 200) : ''}`);
    }

    return Buffer.from(imagePart.inlineData.data, 'base64');
}

async function run() {
    console.log('🎨 Thumbnail v5 — Elevated YouTube\n');

    console.log('Fetching posts...');
    const snap = await db.collection('posts')
        .orderBy('created_at', 'desc')
        .limit(500)
        .get();

    const posts = [];
    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.uid === ADMIN_UID) continue;

        const createdAt = data.created_at?.toDate?.() || (data.created_at?._seconds ? new Date(data.created_at._seconds * 1000) : null);
        if (!createdAt || createdAt > ONE_WEEK_AGO) continue;

        const transcript = data.condensed_transcript || data.public_post?.condensed_transcript;
        if (!transcript || transcript.length === 0) continue;
        if (!data.title) continue;

        const formatted = transcript.map(m =>
            `${m.role === 'user' ? 'Person' : 'Advisor'}: ${m.text}`
        ).join('\n\n');

        posts.push({ id: doc.id, uid: data.uid, title: data.title, conversation: formatted, createdAt });
        if (posts.length >= NUM_SAMPLES) break;
    }

    console.log(`Found ${posts.length} eligible posts\n${'='.repeat(80)}`);

    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const age = Math.round((Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`\n[${i + 1}/${posts.length}] "${post.title}" (${age}d ago)`);

        try {
            const refImage = await loadReferenceImage(post.uid);
            console.log(`     🎬 Generating...`);
            const startTime = Date.now();
            const rawImage = await generateThumbnail(post.conversation.substring(0, 8000), refImage);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            const finalImage = await sharp(rawImage)
                .resize(1280, 720, { fit: 'cover', position: 'center' })
                .jpeg({ quality: 92 })
                .toBuffer();

            const safeTitle = post.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').substring(0, 40);
            const filename = `${OUTPUT_DIR}/${i + 1}_${safeTitle}.jpg`;
            writeFileSync(filename, finalImage);
            console.log(`     ✅ ${filename} (${(finalImage.length / 1024).toFixed(0)}KB, ${elapsed}s)`);
        } catch (err) {
            console.error(`     ❌ ${err.message}`);
        }

        if (i < posts.length - 1) await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n${'='.repeat(80)}\nDone! Check ${OUTPUT_DIR}/`);
}

run().catch(console.error);
