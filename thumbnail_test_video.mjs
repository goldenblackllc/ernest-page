/**
 * Living Thumbnail Test — Veo 3.1 video thumbnails
 * 
 * Same approach as v4 (which worked best):
 *   - Transcript + reference image
 *   - "Generate a thumbnail. Match the emotional tone."
 *   - Let the AI figure it out
 * 
 * But video instead of image. 3-5 second loops.
 */

import { GoogleGenAI } from '@google/genai';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { config } from 'dotenv';
import { writeFileSync, mkdirSync } from 'fs';

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
const OUTPUT_DIR = './thumbnail_samples_video';
const NUM_SAMPLES = 3; // Video gen is slower, start with 3
const ONE_WEEK_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

mkdirSync(OUTPUT_DIR, { recursive: true });

const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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

async function generateVideoThumbnail(transcript, referenceImageBuffer) {
    // Build the prompt — same v4 energy, just for video
    const prompt = `Generate a 3-5 second looping video thumbnail for this advice column conversation.

The video should communicate the subject matter of the conversation so someone can tell what it's about at a glance. It should also match the emotional tone — if the conversation is heavy, the video should feel heavy. If it's light, it should feel light.

Show a scene that reflects a key moment or feeling from the conversation. Include short hook text that matches the mood. The typography, colors, and composition should all reflect the tone.

Keep the motion subtle and cinematic — gentle movement, breathing, ambient shifts. Think living portrait, not action scene.

CONVERSATION:
${transcript}`;

    // Build config
    const generateConfig = {
        aspectRatio: '16:9',
        numberOfVideos: 1,
        durationSeconds: 5,
        personGeneration: 'allow_all',
    };

    // Add reference image if available
    if (referenceImageBuffer) {
        generateConfig.referenceImages = [{
            referenceImage: {
                imageBytes: referenceImageBuffer.toString('base64'),
                mimeType: 'image/jpeg',
            },
            referenceType: 'STYLE_REFERENCE',
        }];
    }

    console.log(`     🎬 Submitting to Veo 3.1...`);
    let operation;
    try {
        operation = await client.models.generateVideos({
            model: 'veo-3.1-generate-preview',
            prompt: prompt,
            config: generateConfig,
        });
    } catch (err) {
        // Try with veo-3.1-fast-generate-preview as fallback
        console.log(`     ⚡ Trying fast model...`);
        operation = await client.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: generateConfig,
        });
    }

    console.log(`     ⏳ Waiting for video generation...`);
    const startTime = Date.now();

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 60; // 10 minutes max
    while (!operation.done && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 10000)); // 10s intervals
        attempts++;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.log(`     ⏳ Still generating... (${elapsed}s)`);
        try {
            operation = await client.operations.get({ name: operation.name });
        } catch (err) {
            console.log(`     ⚠️ Poll error: ${err.message}`);
        }
    }

    if (!operation.done) {
        throw new Error('Video generation timed out');
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`     ✅ Video generated in ${elapsed}s`);

    // Extract video data
    const videos = operation.response?.generatedVideos;
    if (!videos || videos.length === 0) {
        throw new Error('No videos in response');
    }

    const video = videos[0];

    // Get video bytes
    if (video.video?.uri) {
        // Download from URI
        const res = await fetch(video.video.uri);
        return Buffer.from(await res.arrayBuffer());
    } else if (video.video?.videoBytes) {
        return Buffer.from(video.video.videoBytes, 'base64');
    } else {
        throw new Error('No video data found in response: ' + JSON.stringify(Object.keys(video)));
    }
}

async function run() {
    console.log('🎬 Living Thumbnail Test — Veo 3.1 video thumbnails\n');
    console.log('Same v4 approach: transcript + reference + "match the tone" — but video.\n');

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
            const truncated = post.conversation.substring(0, 4000); // Shorter for video

            const videoBuffer = await generateVideoThumbnail(truncated, refImage);

            const safeTitle = post.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').substring(0, 40);
            const filename = `${OUTPUT_DIR}/${i + 1}_${safeTitle}.mp4`;
            writeFileSync(filename, videoBuffer);
            console.log(`     💾 Saved: ${filename} (${(videoBuffer.length / 1024).toFixed(0)}KB)`);

        } catch (err) {
            console.error(`     ❌ ${err.message}`);
            if (err.stack) console.error(`     ${err.stack.split('\n')[1]}`);
        }

        if (i < posts.length - 1) await new Promise(r => setTimeout(r, 5000));
    }

    console.log(`\n${'='.repeat(80)}\nDone! Check ${OUTPUT_DIR}/`);
}

run().catch(console.error);
