/**
 * Thumbnail Test v8 — Character-directed thumbnails
 * 
 * Two-step:
 *   1. Ask Opus (as the character) to design the thumbnail prompt
 *   2. Send that prompt + reference image to Gemini Flash Image
 * 
 * The character who lived the conversation decides what visual to use.
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
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const IMAGE_MODEL = 'gemini-3.1-flash-image';
const OUTPUT_DIR = './thumbnail_samples_v8';
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

async function loadCharacterBible(uid) {
    const userDoc = await db.collection('users').doc(uid).get();
    const data = userDoc.data();
    return data?.character_bible || null;
}

/**
 * Step 1: Ask Opus (as the character) to design the thumbnail
 */
async function askCharacterForThumbnail(transcript, title, characterBible) {
    const characterName = characterBible?.character_name || 'the advisor';
    const archetype = characterBible?.source_code?.archetype || '';
    const manifesto = characterBible?.source_code?.manifesto || '';

    const prompt = `You are ${characterName}, a person's ideal self. Your archetype is "${archetype}".

Here is your manifesto (who you are):
${manifesto.substring(0, 600)}

You just had this conversation with someone who came to you for advice:

TITLE: "${title}"

CONVERSATION:
${transcript}

Now you need to design a thumbnail image for this conversation. This thumbnail will appear on a social feed — think YouTube-quality thumbnails from elevated creators (not cheap clickbait).

Design ONE thumbnail. Describe:
1. THE IMAGE: What scene, setting, objects, lighting, mood, color palette. Be specific and cinematic. The image should tell the story of this conversation at a glance. Think about what visual would make someone curious enough to click.
2. THE TEXT: What short hook text to overlay (use the title or a punchy version of it). Where it goes. What font style and color fits the mood.
3. THE TONE: Is this warm? Heavy? Playful? Urgent? The visual energy should match.

Be specific and vivid. This is YOUR conversation — you know what it felt like. Design the thumbnail like you're art-directing your own show.

Output ONLY a single, detailed image generation prompt that combines the scene, the text, and the tone into one comprehensive instruction for an image generator. No explanations, just the prompt.`;

    // Use Gemini as the "character brain" (Opus-style thinking)
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 1.0 },
            }),
        }
    );

    if (!res.ok) throw new Error(`Character prompt API error: ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Step 2: Send the character's prompt + reference image to Gemini Flash Image
 */
async function generateThumbnailFromPrompt(thumbnailPrompt, referenceImageBuffer) {
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
        ? 'Use this reference image for the character\'s face and identity.\n\n'
        : '';

    parts.push({ text: `${refNote}${thumbnailPrompt}` });

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
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
        throw new Error(`Image API error ${res.status}: ${errText.slice(0, 300)}`);
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
    console.log('🎨 Thumbnail v8 — Character-directed (2-step: character designs → Gemini renders)\n');

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
            // Load character bible
            const bible = await loadCharacterBible(post.uid);
            const charName = bible?.character_name || 'unknown';
            console.log(`     🧠 Character: ${charName} (${bible?.source_code?.archetype || 'no archetype'})`);

            // Step 1: Character designs the thumbnail
            console.log(`     🎨 ${charName} is designing the thumbnail...`);
            const thumbnailPrompt = await askCharacterForThumbnail(
                post.conversation.substring(0, 8000),
                post.title,
                bible
            );
            console.log(`     📝 Prompt: "${thumbnailPrompt.substring(0, 150)}..."`);

            // Step 2: Gemini renders it
            const refImage = await loadReferenceImage(post.uid);
            console.log(`     🎬 Rendering...`);
            const startTime = Date.now();
            const rawImage = await generateThumbnailFromPrompt(thumbnailPrompt, refImage);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            const finalImage = await sharp(rawImage)
                .resize(1280, 720, { fit: 'cover', position: 'center' })
                .jpeg({ quality: 92 })
                .toBuffer();

            const safeTitle = post.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').substring(0, 40);
            const filename = `${OUTPUT_DIR}/${i + 1}_${safeTitle}.jpg`;
            writeFileSync(filename, finalImage);

            // Also save the prompt for review
            writeFileSync(`${OUTPUT_DIR}/${i + 1}_prompt.txt`, `CHARACTER: ${charName}\nARCHETYPE: ${bible?.source_code?.archetype}\nTITLE: ${post.title}\n\nCHARACTER'S THUMBNAIL PROMPT:\n${thumbnailPrompt}`);

            console.log(`     ✅ ${filename} (${(finalImage.length / 1024).toFixed(0)}KB, ${elapsed}s)`);
        } catch (err) {
            console.error(`     ❌ ${err.message}`);
        }

        if (i < posts.length - 1) await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n${'='.repeat(80)}\nDone! Check ${OUTPUT_DIR}/`);
}

run().catch(console.error);
