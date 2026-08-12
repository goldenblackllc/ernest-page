/**
 * Thumbnail Test v4 — Let Gemini do everything. Tone-matched.
 *
 * One prompt. Reference image + transcript. Gemini handles:
 * - The scene/composition
 * - The hook text
 * - The typography style
 * - Matching it all to the emotional tone
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
const OUTPUT_DIR = './thumbnail_samples_v4';
const NUM_SAMPLES = 5;
const ONE_WEEK_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

mkdirSync(OUTPUT_DIR, { recursive: true });

async function loadReferenceImage(uid) {
    const bucket = storage.bucket();
    const candidates = [
        `avatars/${uid}_reference.jpg`,
        `avatars/${uid}.jpg`,
    ];
    for (const fileName of candidates) {
        try {
            const file = bucket.file(fileName);
            const [exists] = await file.exists();
            if (!exists) continue;
            const [buffer] = await file.download();
            console.log(`     📷 Reference loaded: ${fileName}`);
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
        text: `${refNote}Here is a conversation transcript. Generate a thumbnail image for it.

The image should communicate the subject matter of the conversation so someone can tell what it's about at a glance. It should also match the emotional tone — if the conversation is heavy, the image should feel heavy. If it's light, it should feel light. The typography, colors, and composition should all reflect the mood.

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
    console.log('🎨 Thumbnail v4 — Gemini does everything. Tone-matched.\n');

    if (!GEMINI_API_KEY) {
        console.error('No GEMINI_API_KEY found');
        process.exit(1);
    }

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

        posts.push({
            id: doc.id,
            uid: data.uid,
            title: data.title,
            conversation: formatted,
            createdAt,
        });

        if (posts.length >= NUM_SAMPLES) break;
    }

    console.log(`Found ${posts.length} eligible posts\n`);
    console.log('='.repeat(80));

    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const label = `[${i + 1}/${posts.length}]`;
        const age = Math.round((Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60 * 24));

        console.log(`\n${label} "${post.title}" (${age} days ago)`);
        console.log(`     Post ID: ${post.id} | UID: ${post.uid}`);

        try {
            const refImage = await loadReferenceImage(post.uid);
            const truncated = post.conversation.substring(0, 8000);

            console.log(`     🎬 Generating tone-matched thumbnail${refImage ? ' (with ref)' : ''}...`);
            const startTime = Date.now();
            const rawImage = await generateThumbnail(truncated, refImage);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            const finalImage = await sharp(rawImage)
                .resize(1280, 720, { fit: 'cover', position: 'center' })
                .jpeg({ quality: 92 })
                .toBuffer();

            const safeTitle = post.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').substring(0, 40);
            const filename = `${OUTPUT_DIR}/${i + 1}_${safeTitle}.jpg`;
            writeFileSync(filename, finalImage);

            console.log(`     ✅ Saved: ${filename} (${(finalImage.length / 1024).toFixed(0)}KB, ${elapsed}s)`);
        } catch (err) {
            console.error(`     ❌ Failed: ${err.message}`);
        }

        if (i < posts.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Done! Check ${OUTPUT_DIR}/`);
}

run().catch(console.error);
