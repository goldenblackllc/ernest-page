/**
 * Phase 2: Deferred Image Generation
 *
 * Firebase scheduled function that runs every 10 minutes.
 * Finds posts with images_complete === false, generates missing images
 * via gap-filling, and publishes the post once all images are ready.
 *
 * Designed for resilience against Google image API outages:
 * - Only processes a few posts per run (no stampede)
 * - Gap-fills: only generates images for empty slots
 * - Retries across cron cycles (not immediately)
 * - Caps retries so posts don't stay invisible forever
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from './lib/firebase/admin.js';
import { generateMessageImages } from './lib/ai/generatePostImage.js';
import { loadUserReferenceImage } from './lib/ai/loadUserReferenceImage.js';

/** Max posts to process per cron run — keeps each run within time budget */
const MAX_POSTS_PER_RUN = 3;

/** Per-post retry cap — after this many attempts, accept partial images and publish */
const MAX_IMAGE_RETRIES = 10;

export const processPostImages = onSchedule(
    {
        schedule: 'every 10 minutes',
        region: 'us-central1',
        timeoutSeconds: 540,
        memory: '1GiB',
        maxInstances: 1,  // Only one instance at a time — no parallel runs
    },
    async () => {
        // Find posts that need image generation
        const pendingPosts = await db.collection('posts')
            .where('image_style', '==', 'per-message')
            .where('images_complete', '==', false)
            .orderBy('created_at', 'asc')
            .limit(MAX_POSTS_PER_RUN)
            .get();

        if (pendingPosts.empty) {
            console.log('[Phase2] No posts need image generation.');
            return;
        }

        console.log(`[Phase2] Found ${pendingPosts.size} post(s) needing images.`);

        for (const postDoc of pendingPosts.docs) {
            const postData = postDoc.data();
            const imagePrompts: string[] = postData.image_prompts || [];
            const existingImages: string[] = postData.message_images || [];
            const retryCount: number = postData.image_retries || 0;
            const uid: string = postData.uid || postData.authorId;
            const visibility: string = postData.visibility || 'private';

            // Skip if no prompts
            if (imagePrompts.length === 0) {
                console.warn(`[Phase2] Post ${postDoc.id} has no image_prompts — marking complete`);
                await postDoc.ref.update({ images_complete: true });
                continue;
            }

            const filledCount = existingImages.filter(Boolean).length;

            // ── Max retries exceeded — accept what we have and publish ──
            if (retryCount >= MAX_IMAGE_RETRIES) {
                const blankCount = imagePrompts.length - filledCount;
                console.warn(`[Phase2] Post ${postDoc.id} exceeded ${MAX_IMAGE_RETRIES} retries — accepting ${blankCount} blank image(s)`);

                const validUrls = existingImages.filter(Boolean);
                const firstImage = validUrls[0] || null;
                const hasAudio = !!postData.audio_url;

                await postDoc.ref.update({
                    images_complete: true,
                    imagen_urls: validUrls,
                    ...(firstImage && { imagen_url: firstImage }),
                    // Publish if we have at least 1 image and audio
                    ...(firstImage && hasAudio && visibility !== 'private' && { is_public: true }),
                });
                continue;
            }

            console.log(`[Phase2] Processing post ${postDoc.id} (${filledCount}/${imagePrompts.length} images, attempt ${retryCount + 1})`);

            try {
                // Load reference image for character consistency
                const referenceImage = await loadUserReferenceImage(uid);
                const referenceImages = referenceImage ? [referenceImage] : undefined;

                // Generate missing images — gap-filling is built into generateMessageImages
                const urls = await generateMessageImages({
                    prompts: imagePrompts,
                    uid,
                    filePrefix: postDoc.id,
                    referenceImages,
                    existingUrls: existingImages,
                });

                const validUrls = urls.filter(Boolean);
                const firstImage = validUrls[0] || null;
                const allFilled = validUrls.length >= imagePrompts.length;
                const hasAudio = !!postData.audio_url;
                const isComplete = allFilled && hasAudio;

                await postDoc.ref.update({
                    // Map empty strings to null — Firestore rejects undefined
                    message_images: urls.map(u => u || null),
                    imagen_urls: validUrls,
                    images_complete: allFilled,
                    image_retries: retryCount + 1,
                    ...(firstImage && { imagen_url: firstImage }),
                    // Only publish when ALL images are done AND audio exists
                    ...(isComplete && visibility !== 'private' && { is_public: true }),
                });

                console.log(`[Phase2] Post ${postDoc.id}: ${validUrls.length}/${imagePrompts.length} images${allFilled ? ' ✅ complete' : `, ${imagePrompts.length - validUrls.length} remaining`}`);
            } catch (err: any) {
                console.error(`[Phase2] Error processing post ${postDoc.id}:`, err.message);
                // Increment retry counter even on errors so we don't loop forever
                await postDoc.ref.update({
                    image_retries: retryCount + 1,
                    image_last_error: (err?.message || String(err)).slice(0, 500),
                    image_last_error_at: Date.now(),
                });
            }
        }
    }
);
