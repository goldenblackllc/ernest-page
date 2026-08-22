/**
 * Living Thumbnail Test — Veo 3.1 video thumbnails
 * 
 * Same approach as v4 (which worked best):
 *   - Transcript + reference image
 *   - "Generate a thumbnail. Match the emotional tone."
 *   - Let the AI figure it out
 * 
 * But video instead of image. 5 second clips.
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
const NUM_SAMPLES = 3;
const TWO_WEEKS_AGO = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

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
    const prompt = `Generate a 5-second looping video thumbnail for this advice column conversation.

The video should communicate the subject matter so someone can tell what it's about at a glance. It should match the emotional tone — heavy conversations feel heavy, light ones feel light.

Show a scene that reflects the conversation. Include short hook text overlay that matches the mood. The typography, colors, composition, and motion should all reflect the tone.

Be visually creative and unique. Think elevated YouTube, not cheap clickbait. No emojis or arrows.

CONVERSATION:
${transcript}`;

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
    const startTime = Date.now();

    // Try models in order of preference
    const models = [
        'veo-3.1-generate-preview',
        'veo-3.1-fast-generate-preview',
        'veo-3.0-generate-preview',
    ];

    let operation = null;
    let usedModel = null;

    for (const model of models) {
        try {
            // Use the new source argument syntax
            operation = await client.models.generateVideos({
                model,
                source: { text: prompt },
                config: generateConfig,
            });
            usedModel = model;
            break;
        } catch (err) {
            const msg = err.message || String(err);
            // If it's a format issue with source, try the legacy prompt syntax
            if (msg.includes('source') || msg.includes('argument')) {
                try {
                    operation = await client.models.generateVideos({
                        model,
                        prompt,
                        config: generateConfig,
                    });
                    usedModel = model;
                    break;
                } catch (err2) {
                    console.log(`     ⚠️ ${model}: ${(err2.message || String(err2)).substring(0, 120)}`);
                }
            } else {
                console.log(`     ⚠️ ${model}: ${msg.substring(0, 120)}`);
            }
        }
    }

    if (!operation) {
        throw new Error('All models failed');
    }

    console.log(`     ✅ Submitted via ${usedModel}. Polling...`);

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 60; // 10 minutes max
    while (!operation.done && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 10000));
        attempts++;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        if (attempts % 3 === 0) {
            console.log(`     ⏳ Still generating... (${elapsed}s)`);
        }
        try {
            operation = await client.operations.get({ name: operation.name });
        } catch (err) {
            console.log(`     ⚠️ Poll error: ${err.message}`);
        }
    }

    if (!operation.done) {
        throw new Error(`Video generation timed out after ${maxAttempts * 10}s`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Check for errors in the operation
    if (operation.error) {
        throw new Error(`Video generation failed: ${JSON.stringify(operation.error)}`);
    }

    console.log(`     ✅ Video generated in ${elapsed}s`);

    // Extract video data
    const videos = operation.response?.generatedVideos;
    if (!videos || videos.length === 0) {
        // Try to access it differently
        console.log(`     📦 Response keys: ${JSON.stringify(Object.keys(operation.response || {}))}`);
        throw new Error('No videos in response');
    }

    const video = videos[0];

    // Get video bytes — try multiple access patterns
    if (video.video?.uri) {
        console.log(`     📥 Downloading from URI...`);
        const res = await fetch(video.video.uri);
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    } else if (video.video?.videoBytes) {
        return Buffer.from(video.video.videoBytes, 'base64');
    } else if (video.video) {
        console.log(`     📦 Video object keys: ${JSON.stringify(Object.keys(video.video))}`);
        // Try any buffer-like property
        for (const key of Object.keys(video.video)) {
            const val = video.video[key];
            if (typeof val === 'string' && val.length > 1000) {
                return Buffer.from(val, 'base64');
            }
        }
    }

    throw new Error('Could not extract video data from response');
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
        if (!createdAt || createdAt > TWO_WEEKS_AGO) continue;

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
            const truncated = post.conversation.substring(0, 4000);

            const videoBuffer = await generateVideoThumbnail(truncated, refImage);

            const safeTitle = post.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').substring(0, 40);
            const filename = `${OUTPUT_DIR}/${i + 1}_${safeTitle}.mp4`;
            writeFileSync(filename, videoBuffer);
            console.log(`     💾 Saved: ${filename} (${(videoBuffer.length / 1024).toFixed(0)}KB)`);

        } catch (err) {
            console.error(`     ❌ ${err.message}`);
        }

        if (i < posts.length - 1) await new Promise(r => setTimeout(r, 5000));
    }

    console.log(`\n${'='.repeat(80)}\nDone! Check ${OUTPUT_DIR}/`);
}

run().catch(console.error);
