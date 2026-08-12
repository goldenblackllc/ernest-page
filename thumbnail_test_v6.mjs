/**
 * Thumbnail Test v6 — Scene-driven, not portrait-driven.
 * 
 * Push Gemini to put the person INTO a scene that tells the story,
 * not just photograph their face with text next to it.
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
const OUTPUT_DIR = './thumbnail_samples_v6';
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

async function generateThumbnail(transcript, title, referenceImageBuffer) {
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
        ? 'The reference image shows the person in this conversation. Use their face and identity but place them INTO a scene — do NOT just photograph their face.\n\n'
        : '';

    parts.push({
        text: `${refNote}Generate a thumbnail for this advice column conversation.

TITLE: "${title}"

CONVERSATION:
${transcript}

THUMBNAIL RULES:
- Show a SCENE that tells the story. The viewer should instantly know what this conversation is about from the image alone. Think: a person at their kitchen table staring at bills, a person standing at a crossroads, a person mid-conversation at a coffee shop — not just a headshot.
- The person should be IN the scene doing something or in a specific place related to the topic. They are part of the world, not floating in front of a blurred background.
- Include short hook text (use the title or a shortened version of it). Place it where it doesn't cover the important parts of the scene.
- Match the emotional tone — heavy conversations get muted, serious visuals. Light conversations get warm, bright visuals. The font style should match the mood.
- No arrows, no emojis, no split-screen collages, no badges.
- 16:9 landscape.`
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
    console.log('🎨 Thumbnail v6 — Scene-driven + title as hook text\n');

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

        const transcript = data.public_post?.condensed_transcript;
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
            const rawImage = await generateThumbnail(post.conversation.substring(0, 8000), post.title, refImage);
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
