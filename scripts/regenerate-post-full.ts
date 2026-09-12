/**
 * Regenerate EVERYTHING for an existing post: transcript, images, audio, thumbnail.
 *
 * Usage:
 *   npx tsx scripts/regenerate-post-full.ts <postId>
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
    console.error('Usage: npx tsx scripts/regenerate-post-full.ts <postId>');
    process.exit(1);
}

async function main() {
    // 1. Fetch post
    const postDoc = await db.collection('posts').doc(postId).get();
    if (!postDoc.exists) { console.error(`❌ Post ${postId} not found`); process.exit(1); }

    const postData = postDoc.data()!;
    const uid = postData.authorId || postData.uid;
    const transcript = postData.content_raw;

    console.log(`\n📋 Post: ${postId}`);
    console.log(`📝 Title: ${postData.title || '(none)'}`);
    console.log(`👤 Author: ${uid}`);

    if (!transcript) {
        console.error('❌ Post has no stored transcript (content_raw) — cannot regenerate');
        process.exit(1);
    }
    console.log(`📄 Transcript: ${transcript.length} chars`);

    // 2. Fetch user data
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    if (!userData) { console.error(`❌ User data not found for ${uid}`); process.exit(1); }

    const characterVoiceId = userData?.character_bible?.voice_id || userData?.voice?.id;
    const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];
    const identity = userData?.identity;
    const gender = identity?.gender || '';

    const age = identity?.birthdate ? (() => {
        const bd = new Date(identity.birthdate);
        return Math.floor((Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    })() : null;
    const demographicHint = [
        identity?.gender,
        age ? `approximately ${age} years old` : null,
        identity?.ethnicity,
    ].filter(Boolean).join(', ');

    if (!characterVoiceId) {
        console.warn('⚠️  No voice configured — audio will be skipped');
    }

    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Regenerate transcript, prompts, audio, thumbnail
    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n🔄 Step 1: Regenerating transcript, prompts, audio, thumbnail...\n`);

    const { processPostContent } = await import('../src/lib/ai/processPostContent');

    const pipelineResult = await processPostContent({
        transcript,
        uid,
        postId,
        compiledBible,
        demographicHint,
        characterVoiceId,
        gender,
        locale: userData?.preferred_locale || 'en',
        logPrefix: 'RegenFull',
    });

    if (!pipelineResult) {
        console.error('❌ Transcript was not deemed publishable');
        process.exit(1);
    }

    const { condensed, imagePrompts, audioFields, thumbnailUrl } = pipelineResult;

    // Update post with transcript + audio + thumbnail (images not yet generated)
    const updateData: Record<string, any> = {
        title: condensed.title,
        public_post: { condensed_transcript: condensed.messages },
        condensed_editorial_note: condensed.editorial_note,
        image_style: 'per-message',
        image_prompts: imagePrompts,
        message_images: [],
        image_retries: 0,
        imagen_url: null,
        imagen_urls: [],
        visual_style: null,
        language: condensed.language,
        images_complete: false,
        is_public: false,
    };

    if (audioFields.audio_url) Object.assign(updateData, audioFields);
    if (thumbnailUrl) updateData.thumbnail_url = thumbnailUrl;

    await postDoc.ref.update(updateData);

    console.log(`\n   📝 Title: "${condensed.title}"`);
    console.log(`   💬 Messages: ${condensed.messages.length}`);
    console.log(`   🎨 Image prompts: ${imagePrompts.length}`);
    console.log(`   🔊 Audio: ${!!audioFields.audio_url}`);
    console.log(`   🖼️  Thumbnail: ${!!thumbnailUrl}`);

    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: Generate images
    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n🔄 Step 2: Generating ${imagePrompts.length} images...\n`);

    const { generateMessageImages } = await import('../functions/src/lib/ai/generatePostImage');
    const { loadUserReferenceImage } = await import('../functions/src/lib/ai/loadUserReferenceImage');

    const referenceImage = await loadUserReferenceImage(uid);
    console.log(`📸 Reference image: ${!!referenceImage}`);

    const urls = await generateMessageImages({
        prompts: imagePrompts,
        uid,
        filePrefix: postId,
        referenceImages: referenceImage ? [referenceImage] : undefined,
        existingUrls: [],
    });

    const validUrls = urls.filter(Boolean);
    const firstImage = validUrls[0] || null;
    const allFilled = validUrls.length >= imagePrompts.length;
    const hasAudio = !!audioFields.audio_url;
    const isComplete = allFilled && hasAudio;

    if (firstImage) {
        await postDoc.ref.update({
            message_images: urls.map(u => u || null),
            imagen_urls: validUrls,
            imagen_url: firstImage,
            images_complete: allFilled,
            ...(isComplete && postData.visibility !== 'private' && { is_public: true }),
        });
    }

    // ═══════════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════════
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`✅ Post ${postId} fully regenerated!`);
    console.log(`   📝 Title: "${condensed.title}"`);
    console.log(`   💬 Messages: ${condensed.messages.length}`);
    console.log(`   🖼️  Thumbnail: ${!!thumbnailUrl}`);
    console.log(`   🔊 Audio: ${!!audioFields.audio_url}`);
    console.log(`   📷 Images: ${validUrls.length}/${imagePrompts.length}`);
    console.log(`   🌐 Public: ${isComplete && postData.visibility !== 'private'}`);
    if (!hasAudio) console.log(`   ⚠️  No audio — user needs a voice configured`);
    if (!allFilled) console.log(`   ⚠️  Some images failed — run again to gap-fill`);
    console.log(`${'═'.repeat(50)}\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
