/**
 * Regenerate the hero image for an existing post.
 *
 * Usage:
 *   npx tsx scripts/regenerate-image.ts <postId> [--prompt "custom prompt"]
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// ─── Firebase init ──────────────────────────────────────────────────────────
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not found in .env.local');
    process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);

if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
}

const db = getFirestore();
const storage = getStorage();

// ─── Parse args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const postId = args.find(a => !a.startsWith('--'));
const promptFlagIdx = args.indexOf('--prompt');
const customPrompt = promptFlagIdx !== -1 ? args[promptFlagIdx + 1] : null;

if (!postId) {
    console.error('Usage: npx tsx scripts/regenerate-image.ts <postId> [--prompt "custom prompt"]');
    process.exit(1);
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
    // 1. Fetch the post
    const postDoc = await db.collection('posts').doc(postId!).get();
    if (!postDoc.exists) {
        console.error(`❌ Post ${postId} not found`);
        process.exit(1);
    }

    const postData = postDoc.data()!;
    const prompt = customPrompt || postData.imagen_prompt;

    if (!prompt) {
        console.error('❌ No imagen_prompt on this post and no --prompt override provided');
        process.exit(1);
    }

    console.log(`\n📋 Post: ${postId}`);
    console.log(`📝 Title: ${postData.public_post?.title || postData.title || '(none)'}`);
    console.log(`🎯 Prompt: ${prompt.substring(0, 120)}...`);
    console.log(`🔄 Calling Imagen API...\n`);

    // 2. Call Imagen
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
        console.error('❌ No GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY in env');
        process.exit(1);
    }

    const imagenRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                instances: [{ prompt }],
                parameters: {
                    sampleCount: 1,
                    aspectRatio: '16:9',
                    personGeneration: 'ALLOW_ADULT',
                },
            }),
        }
    );

    if (!imagenRes.ok) {
        console.error('❌ Imagen API Error:', await imagenRes.text());
        process.exit(1);
    }

    const data = await imagenRes.json();
    const prediction = data.predictions?.[0];

    // 3. Check safety filters
    if (prediction?.raiFilteredReason) {
        console.error(`⚠️  RAI Filter: ${prediction.raiFilteredReason}`);
        console.error('   Try again with --prompt and a softer description.');
        process.exit(1);
    }

    if (prediction?.safetyAttributes) {
        console.log('🛡️  Safety attributes:', JSON.stringify(prediction.safetyAttributes));
    }

    if (!prediction?.bytesBase64Encoded) {
        console.error('❌ Imagen returned no image data:', JSON.stringify(data));
        process.exit(1);
    }

    console.log('✅ Image generated successfully');

    // 4. Upload to Cloud Storage
    const buffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');
    const bucket = storage.bucket();
    const fileName = `post-images/${postId}_imagen.jpg`;
    const file = bucket.file(fileName);

    await file.save(buffer, {
        metadata: {
            contentType: 'image/jpeg',
            cacheControl: 'public, max-age=300',
        },
    });
    try { await file.makePublic(); } catch { /* UBLA */ }

    const imagen_url = `https://storage.googleapis.com/${bucket.name}/${fileName}?v=${Date.now()}`;
    console.log(`☁️  Uploaded: ${imagen_url}`);

    // 5. Update Firestore
    const updates: Record<string, any> = { imagen_url };
    if (customPrompt) {
        updates.imagen_prompt = customPrompt;
    }
    // If post was forced private due to missing image, restore visibility
    if (!postData.is_public && postData.visibility !== 'private') {
        updates.is_public = true;
        console.log('🔓 Restoring public visibility');
    }

    await postDoc.ref.update(updates);
    console.log(`\n🎉 Done! Post ${postId} updated with new image.`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
