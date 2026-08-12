/**
 * Thumbnail Test v2 — Bare minimum prompt. Just the transcript.
 * 
 * No style instructions, no title, no aspect ratio hints.
 * Just: "Here is a conversation. Generate a thumbnail."
 */

import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { config } from 'dotenv';
import { writeFileSync, mkdirSync } from 'fs';

config({ path: '.env.local' });

if (!getApps().length) {
    initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
    });
}
const db = getFirestore();

const ADMIN_UID = 'nTsKkFFR2rbfqohxYx1zZN6fJTZ2';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const MODEL = 'gemini-3.1-flash-image';
const OUTPUT_DIR = './thumbnail_samples_v2';
const NUM_SAMPLES = 5;

// Skip recent posts (wife's) — only grab posts older than 7 days
const ONE_WEEK_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * Bare minimum — just the transcript, nothing else.
 */
async function generateThumbnail(transcript) {
    const prompt = `Here is a conversation transcript. Generate a thumbnail image for it.

${transcript}`;

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [{ text: prompt }],
                }],
                generationConfig: {
                    responseModalities: ['IMAGE'],
                },
            }),
        }
    );

    if (!res.ok) {
        const errText = await res.text().catch(() => '(unreadable)');
        throw new Error(`API error ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts?.length) throw new Error('No parts in response');

    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imagePart) {
        const textPart = parts.find(p => p.text);
        throw new Error(`No image returned${textPart ? ': ' + textPart.text.slice(0, 200) : ''}`);
    }

    return Buffer.from(imagePart.inlineData.data, 'base64');
}

async function run() {
    console.log('🎨 Thumbnail Test v2 — BARE MINIMUM prompt (no styling, no title, no hints)\n');
    console.log(`Skipping posts newer than ${ONE_WEEK_AGO.toISOString()}\n`);

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

        // Skip recent posts
        const createdAt = data.created_at?.toDate?.() || (data.created_at?._seconds ? new Date(data.created_at._seconds * 1000) : null);
        if (!createdAt || createdAt > ONE_WEEK_AGO) continue;

        const transcript = data.public_post?.condensed_transcript;
        if (!transcript || transcript.length === 0) continue;
        if (!data.title) continue;

        const formatted = transcript.map(m =>
            `${m.role === 'user' ? 'Person' : 'Advisor'}: ${m.text}`
        ).join('\n\n');

        posts.push({
            id: doc.id,
            title: data.title,
            conversation: formatted,
            createdAt,
        });

        if (posts.length >= NUM_SAMPLES) break;
    }

    console.log(`Found ${posts.length} eligible posts (older than 1 week, non-admin)\n`);
    console.log('='.repeat(80));

    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const label = `[${i + 1}/${posts.length}]`;
        const age = Math.round((Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60 * 24));

        console.log(`\n${label} "${post.title}" (${age} days ago)`);
        console.log(`     Post ID: ${post.id}`);

        try {
            const truncated = post.conversation.substring(0, 8000);

            console.log(`     Generating thumbnail (bare prompt)...`);
            const startTime = Date.now();
            const buffer = await generateThumbnail(truncated);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            const safeTitle = post.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').substring(0, 40);
            const filename = `${OUTPUT_DIR}/${i + 1}_${safeTitle}.png`;
            writeFileSync(filename, buffer);

            console.log(`     ✅ Saved: ${filename} (${(buffer.length / 1024).toFixed(0)}KB, ${elapsed}s)`);
        } catch (err) {
            console.error(`     ❌ Failed: ${err.message}`);
        }

        if (i < posts.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Done! Check ${OUTPUT_DIR}/ for the generated thumbnails.`);
}

run().catch(console.error);
