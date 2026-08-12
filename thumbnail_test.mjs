/**
 * Thumbnail Test — Send transcript directly to Gemini Flash Image
 * 
 * No intermediate prompt generation. Just:
 *   1. Pull condensed transcripts from Firestore (non-admin)
 *   2. Send transcript + "generate a thumbnail" to Gemini
 *   3. Save the resulting images locally for review
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
const OUTPUT_DIR = './thumbnail_samples';
const NUM_SAMPLES = 5;

// Ensure output directory exists
mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * Call Gemini Flash Image directly — no prompt engineering,
 * just the transcript + a simple instruction.
 */
async function generateThumbnail(transcript, title) {
    const prompt = `Generate a cinematic 16:9 thumbnail image for this advice column conversation.

Title: "${title}"

Conversation:
${transcript}

The image should work as a video thumbnail — visually striking, emotionally resonant with the conversation's theme, photorealistic. No text, no words, no watermarks anywhere in the image. 16:9 landscape orientation.`;

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
    if (!parts?.length) {
        throw new Error('No parts in response');
    }

    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imagePart) {
        const textPart = parts.find(p => p.text);
        throw new Error(`No image returned${textPart ? ': ' + textPart.text.slice(0, 200) : ''}`);
    }

    return Buffer.from(imagePart.inlineData.data, 'base64');
}

async function run() {
    console.log('🎨 Thumbnail Test — Transcript → Gemini Flash Image (no prompt engineering)\n');

    if (!GEMINI_API_KEY) {
        console.error('No GEMINI_API_KEY found');
        process.exit(1);
    }

    // Fetch non-admin posts with condensed transcripts
    console.log('Fetching posts...');
    const snap = await db.collection('posts')
        .orderBy('created_at', 'desc')
        .limit(200)
        .get();

    const posts = [];
    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.uid === ADMIN_UID) continue;

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
        });

        if (posts.length >= NUM_SAMPLES) break;
    }

    console.log(`Found ${posts.length} eligible posts\n`);
    console.log('='.repeat(80));

    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const label = `[${i + 1}/${posts.length}]`;

        console.log(`\n${label} "${post.title}"`);
        console.log(`     Post ID: ${post.id}`);
        console.log(`     Transcript length: ${post.conversation.length} chars`);

        try {
            // Truncate very long transcripts to stay within token limits
            const truncated = post.conversation.substring(0, 8000);
            
            console.log(`     Generating thumbnail...`);
            const startTime = Date.now();
            const buffer = await generateThumbnail(truncated, post.title);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            // Save to disk
            const safeTitle = post.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').substring(0, 40);
            const filename = `${OUTPUT_DIR}/${i + 1}_${safeTitle}.png`;
            writeFileSync(filename, buffer);

            console.log(`     ✅ Saved: ${filename} (${(buffer.length / 1024).toFixed(0)}KB, ${elapsed}s)`);
        } catch (err) {
            console.error(`     ❌ Failed: ${err.message}`);
        }

        // Small delay between requests to avoid rate limits
        if (i < posts.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Done! Check ${OUTPUT_DIR}/ for the generated thumbnails.`);
}

run().catch(console.error);
