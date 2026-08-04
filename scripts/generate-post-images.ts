/**
 * Generate images for a post that already has image_prompts saved.
 * Uses the same inline approach as processChat (no separate Cloud Function needed).
 *
 * Usage:
 *   npx tsx scripts/generate-post-images.ts <postId>
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not found in .env.local');
    process.exit(1);
}

// Write service account to temp file so @google-cloud/storage picks it up
const saPath = join(tmpdir(), 'sa-key.json');
writeFileSync(saPath, serviceAccountJson);
process.env.GOOGLE_APPLICATION_CREDENTIALS = saPath;

if (!getApps().length) {
    initializeApp({
        credential: cert(JSON.parse(serviceAccountJson)),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
}

const db = getFirestore();
const postId = process.argv[2];
if (!postId) {
    console.error('Usage: npx tsx scripts/generate-post-images.ts <postId>');
    process.exit(1);
}

async function main() {
    const postDoc = await db.collection('posts').doc(postId).get();
    if (!postDoc.exists) { console.error(`❌ Post ${postId} not found`); process.exit(1); }

    const postData = postDoc.data()!;
    const imagePrompts = postData.image_prompts;
    if (!imagePrompts?.length) { console.error('❌ No image_prompts on this post'); process.exit(1); }

    const uid = postData.uid || postData.authorId;
    console.log(`\n🖼️  Generating ${imagePrompts.length} images for post ${postId}...`);

    // Import the same functions used by processChat
    const { generateMessageImages } = await import('../functions/src/lib/ai/generatePostImage');
    const { loadUserReferenceImage } = await import('../functions/src/lib/ai/loadUserReferenceImage');

    const referenceImage = await loadUserReferenceImage(uid);
    console.log(`📸 Reference image: ${!!referenceImage}`);

    const urls = await generateMessageImages({
        prompts: imagePrompts,
        uid,
        filePrefix: postId,
        referenceImages: referenceImage ? [referenceImage] : undefined,
        existingUrls: postData.message_images,
    });

    const validUrls = urls.filter(Boolean);
    const firstImage = validUrls[0] || null;
    const allFilled = validUrls.length >= imagePrompts.length;
    const hasAudio = !!postData.audio_url;
    const isComplete = allFilled && hasAudio;

    if (firstImage) {
        await postDoc.ref.update({
            // Replace empty strings with null — Firestore rejects undefined but accepts null.
            // Preserves array indexing so gap-filling works on re-runs.
            message_images: urls.map(u => u || null),
            imagen_urls: validUrls,
            imagen_url: firstImage,
            images_complete: allFilled,
            ...(isComplete && postData.visibility !== 'private' && { is_public: true }),
        });
        console.log(`\n✅ Done! ${validUrls.length}/${imagePrompts.length} images generated.`);
        console.log(`   🔊 Audio: ${hasAudio}`);
        console.log(`   📷 All images: ${allFilled}`);
        console.log(`   🌐 Public: ${isComplete && postData.visibility !== 'private'}`);
    } else {
        console.error('❌ Failed to generate any images');
        process.exit(1);
    }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
