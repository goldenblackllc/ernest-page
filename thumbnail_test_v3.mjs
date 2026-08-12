/**
 * Thumbnail Test v3 — Reference image + bare prompt + branded text overlay
 *
 * 1. Load the user's reference image from Cloud Storage
 * 2. Send transcript + reference image to Gemini with bare prompt
 * 3. Get back cinematic image with the ACTUAL person in it
 * 4. Composite the post title as branded text via Canvas
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { config } from 'dotenv';
import { writeFileSync, mkdirSync } from 'fs';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
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
const OUTPUT_DIR = './thumbnail_samples_v3';
const NUM_SAMPLES = 5;
const ONE_WEEK_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── Load reference image from Cloud Storage ────────────────────────────────

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
            console.log(`     📷 Loaded reference: ${fileName} (${(buffer.length / 1024).toFixed(0)}KB)`);
            return buffer;
        } catch (err) {
            // continue to next candidate
        }
    }
    return null;
}

// ─── Generate thumbnail with reference image ────────────────────────────────

async function generateThumbnail(transcript, referenceImageBuffer) {
    const parts = [];

    // Reference image first (identity anchor)
    if (referenceImageBuffer) {
        parts.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: referenceImageBuffer.toString('base64'),
            },
        });
    }

    // Bare prompt — just the transcript
    const refInstruction = referenceImageBuffer
        ? 'Use the reference image to maintain the character\'s face and identity in the scene.\n\n'
        : '';

    parts.push({
        text: `${refInstruction}Here is a conversation transcript. Generate a thumbnail image for it. No text or words in the image.

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

// ─── Composite branded title text onto image ─────────────────────────────────

async function compositeTitle(imageBuffer, title) {
    // Resize to consistent 1280x720
    const resized = await sharp(imageBuffer)
        .resize(1280, 720, { fit: 'cover', position: 'center' })
        .png()
        .toBuffer();

    const WIDTH = 1280;
    const HEIGHT = 720;
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Draw the base image
    const img = await loadImage(resized);
    ctx.drawImage(img, 0, 0, WIDTH, HEIGHT);

    // ── Bottom gradient (cinematic lower-third) ──
    const gradHeight = HEIGHT * 0.45;
    const grad = ctx.createLinearGradient(0, HEIGHT - gradHeight, 0, HEIGHT);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.4, 'rgba(0, 0, 0, 0.5)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, HEIGHT - gradHeight, WIDTH, gradHeight);

    // ── Title text ──
    const maxWidth = WIDTH - 100; // 50px padding each side
    const maxFontSize = 52;
    const minFontSize = 32;
    let fontSize = maxFontSize;

    // Find the right font size
    ctx.font = `bold ${fontSize}px sans-serif`;
    const words = title.split(' ');

    function wrapText(size) {
        ctx.font = `bold ${size}px sans-serif`;
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
    }

    // Scale down if too many lines
    let lines = wrapText(fontSize);
    while (lines.length > 3 && fontSize > minFontSize) {
        fontSize -= 2;
        lines = wrapText(fontSize);
    }

    const lineHeight = fontSize * 1.2;
    const totalTextHeight = lines.length * lineHeight;
    const textY = HEIGHT - 40 - totalTextHeight; // 40px from bottom

    // Draw text with strong shadow
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (let i = 0; i < lines.length; i++) {
        const y = textY + i * lineHeight;
        const x = 50;

        // Black outline/shadow for readability
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.lineWidth = 5;
        ctx.lineJoin = 'round';
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.strokeText(lines[i], x, y);

        // White fill
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(lines[i], x, y);
    }

    // ── Small "Earnest Page" branding, bottom-right ──
    const brandSize = 14;
    ctx.font = `600 ${brandSize}px sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.textAlign = 'right';
    ctx.fillText('Earnest Page', WIDTH - 30, HEIGHT - 20);

    // Export as JPEG
    const pngBuffer = canvas.toBuffer('image/png');
    return await sharp(pngBuffer).jpeg({ quality: 90 }).toBuffer();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
    console.log('🎨 Thumbnail v3 — Reference image + bare prompt + branded text overlay\n');

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

        const transcript = data.public_post?.condensed_transcript;
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
            // Step 1: Load reference image
            const refImage = await loadReferenceImage(post.uid);

            // Step 2: Generate thumbnail with Gemini
            const truncated = post.conversation.substring(0, 8000);
            console.log(`     🎬 Generating thumbnail${refImage ? ' (with reference)' : ' (no reference)'}...`);
            const startTime = Date.now();
            const rawImage = await generateThumbnail(truncated, refImage);
            const genTime = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`     ✅ Image generated (${genTime}s)`);

            // Save raw version (no text) for comparison
            const safeTitle = post.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').substring(0, 40);
            const rawFilename = `${OUTPUT_DIR}/${i + 1}_raw_${safeTitle}.jpg`;
            const resizedRaw = await sharp(rawImage).resize(1280, 720, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
            writeFileSync(rawFilename, resizedRaw);

            // Step 3: Composite title text
            console.log(`     🔤 Compositing title text...`);
            const finalImage = await compositeTitle(rawImage, post.title);
            const finalFilename = `${OUTPUT_DIR}/${i + 1}_final_${safeTitle}.jpg`;
            writeFileSync(finalFilename, finalImage);
            console.log(`     ✅ Saved: ${finalFilename} (${(finalImage.length / 1024).toFixed(0)}KB)`);

        } catch (err) {
            console.error(`     ❌ Failed: ${err.message}`);
        }

        if (i < posts.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`Done! Check ${OUTPUT_DIR}/ for raw + final thumbnails.`);
}

run().catch(console.error);
