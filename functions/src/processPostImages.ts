/**
 * Phase 2: Deferred Image Generation (Batch Mode)
 *
 * Firebase scheduled function that runs every 10 minutes.
 *
 * Two-phase architecture:
 *   Phase A — Poll active batch jobs: check if any previously submitted
 *             batch jobs have completed, collect results, validate, upload.
 *   Phase B — Submit new batch jobs: find posts with missing images,
 *             build batch requests, submit to Gemini Batch API at 50% cost.
 *
 * Designed for resilience against Google image API outages:
 * - Only processes a few posts per run (no stampede)
 * - Gap-fills: only generates images for empty slots
 * - Retries across cron cycles (not immediately)
 * - Caps retries so posts don't stay invisible forever
 *
 * Cost optimization: Uses the Gemini Batch API instead of synchronous
 * generateContent calls, saving ~50% on image generation costs.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import sharp from 'sharp';
import { db } from './lib/firebase/admin.js';
import { buildMessageImageBatchRequests, uploadImageBuffer } from './lib/ai/generatePostImage.js';
import { loadUserReferenceImage } from './lib/ai/loadUserReferenceImage.js';
import { submitImageBatch, pollBatchJob, type ParsedBatchResult } from './lib/ai/batchImageGeneration.js';
import {
    createBatchRecord,
    getActiveBatchJobs,
    updateBatchJobState,
    deleteBatchRecord,
    type BatchJobRecord,
} from './lib/ai/batchJobTracker.js';

/** Max posts to process per cron run — keeps each run within time budget */
const MAX_POSTS_PER_RUN = 3;

/** Per-post retry cap — after this many attempts, accept partial images and publish */
const MAX_IMAGE_RETRIES = 10;

export const processPostImages = onSchedule(
    {
        schedule: 'every 10 minutes',
        region: 'us-central1',
        timeoutSeconds: 1800,
        memory: '2GiB',
        maxInstances: 1,  // Only one instance at a time — no parallel runs
    },
    async () => {
        // ═════════════════════════════════════════════════════════════════════
        // Phase A: Poll active batch jobs and collect completed results
        // ═════════════════════════════════════════════════════════════════════

        try {
            const activeJobs = await getActiveBatchJobs();

            if (activeJobs.length > 0) {
                console.log(`[Phase2] Polling ${activeJobs.length} active batch job(s)...`);

                for (const job of activeJobs) {
                    await processCompletedBatch(job);
                }
            }
        } catch (err: any) {
            console.error('[Phase2] Error in Phase A (poll):', err.message);
            // Continue to Phase B even if polling fails
        }

        // ═════════════════════════════════════════════════════════════════════
        // Phase B: Submit new batch jobs for posts needing images
        // ═════════════════════════════════════════════════════════════════════

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

        // Collect all batch requests across posts
        const allBatchRequests: any[] = [];
        const promptMapping: Record<string, { postId: string; index: number }> = {};
        const postIds: string[] = [];
        const postsToIncrement: Array<{ ref: FirebaseFirestore.DocumentReference; retryCount: number }> = [];

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

                // Build batch requests for missing images
                const { requests, missingIndices } = buildMessageImageBatchRequests({
                    prompts: imagePrompts,
                    filePrefix: postDoc.id,
                    referenceImages,
                    existingUrls: existingImages,
                });

                if (requests.length === 0) {
                    // All images already filled — mark complete
                    const hasAudio = !!postData.audio_url;
                    await postDoc.ref.update({
                        images_complete: true,
                        imagen_urls: existingImages.filter(Boolean),
                        imagen_url: existingImages.find(Boolean) || null,
                        ...(hasAudio && visibility !== 'private' && { is_public: true }),
                    });
                    continue;
                }

                // Add to batch
                allBatchRequests.push(...requests);
                postIds.push(postDoc.id);
                postsToIncrement.push({ ref: postDoc.ref, retryCount });

                // Map each request key back to its post and index
                for (const idx of missingIndices) {
                    promptMapping[`${postDoc.id}_msg${idx}`] = { postId: postDoc.id, index: idx };
                }
            } catch (err: any) {
                console.error(`[Phase2] Error building batch for post ${postDoc.id}:`, err.message);
                await postDoc.ref.update({
                    image_retries: retryCount + 1,
                    image_last_error: (err?.message || String(err)).slice(0, 500),
                    image_last_error_at: Date.now(),
                });
            }
        }

        // Submit the consolidated batch
        if (allBatchRequests.length > 0) {
            try {
                console.log(`[Phase2] Submitting batch of ${allBatchRequests.length} image requests across ${postIds.length} post(s)`);
                const jobName = await submitImageBatch(allBatchRequests);
                console.log(`[Phase2] Batch job submitted: ${jobName}`);

                // Track the batch job in Firestore
                await createBatchRecord({
                    jobName,
                    state: 'JOB_STATE_PENDING',
                    created_at: Date.now(),
                    updated_at: Date.now(),
                    post_ids: [...new Set(postIds)],
                    prompt_mapping: promptMapping,
                    error: null,
                });

                // Increment retry counter on all participating posts
                for (const { ref, retryCount } of postsToIncrement) {
                    await ref.update({ image_retries: retryCount + 1 });
                }
            } catch (err: any) {
                console.error('[Phase2] Error submitting batch job:', err.message);
                // Increment retry counters even on batch submission failure
                for (const { ref, retryCount } of postsToIncrement) {
                    await ref.update({
                        image_retries: retryCount + 1,
                        image_last_error: (err?.message || String(err)).slice(0, 500),
                        image_last_error_at: Date.now(),
                    });
                }
            }
        }
    }
);

// ─── Phase A Helpers ─────────────────────────────────────────────────────────

/**
 * Process a single completed or in-progress batch job.
 * If the job is complete (succeeded/failed), collect results and update posts.
 */
async function processCompletedBatch(job: BatchJobRecord): Promise<void> {
    try {
        const status = await pollBatchJob(job.jobName);
        console.log(`[Phase2] Batch ${job.jobName} state: ${status.state}`);

        if (status.state === 'JOB_STATE_PENDING' || status.state === 'JOB_STATE_RUNNING') {
            // Still in progress — update state in tracker and wait for next cycle
            await updateBatchJobState(job.jobName, status.state as BatchJobRecord['state']);
            return;
        }

        if (status.state === 'JOB_STATE_FAILED' || status.state === 'JOB_STATE_CANCELLED') {
            console.error(`[Phase2] Batch ${job.jobName} ${status.state}`);
            await updateBatchJobState(job.jobName, status.state as BatchJobRecord['state'], `Batch job ${status.state}`);
            // Don't increment retries here — they were incremented at submission time
            return;
        }

        if (status.state === 'JOB_STATE_SUCCEEDED' && status.results) {
            console.log(`[Phase2] Batch ${job.jobName} completed with ${status.results.length} results`);

            // Group results by post ID
            const resultsByPost: Record<string, Array<{ index: number; result: ParsedBatchResult }>> = {};

            for (const result of status.results) {
                const mapping = job.prompt_mapping[result.key];
                if (!mapping) {
                    console.warn(`[Phase2] No mapping found for batch result key: ${result.key}`);
                    continue;
                }

                if (!resultsByPost[mapping.postId]) {
                    resultsByPost[mapping.postId] = [];
                }
                resultsByPost[mapping.postId].push({ index: mapping.index, result });
            }

            // Process each post's results
            for (const [postId, postResults] of Object.entries(resultsByPost)) {
                await processPostBatchResults(postId, postResults);
            }

            // Clean up the batch record
            await updateBatchJobState(job.jobName, 'JOB_STATE_SUCCEEDED');
            await deleteBatchRecord(job.jobName);
        }
    } catch (err: any) {
        console.error(`[Phase2] Error processing batch ${job.jobName}:`, err.message);
    }
}

/**
 * Process batch results for a single post: validate images, resize,
 * upload to GCS, and update Firestore.
 */
async function processPostBatchResults(
    postId: string,
    results: Array<{ index: number; result: ParsedBatchResult }>
): Promise<void> {
    try {
        const postDoc = await db.collection('posts').doc(postId).get();
        if (!postDoc.exists) {
            console.warn(`[Phase2] Post ${postId} no longer exists — skipping`);
            return;
        }

        const postData = postDoc.data()!;
        const imagePrompts: string[] = postData.image_prompts || [];
        const existingImages: string[] = postData.message_images || [];
        const uid: string = postData.uid || postData.authorId;
        const visibility: string = postData.visibility || 'private';

        // Start with existing images (gap-filling)
        const urls: string[] = new Array(imagePrompts.length).fill('');
        for (let i = 0; i < Math.min(existingImages.length, imagePrompts.length); i++) {
            urls[i] = existingImages[i] || '';
        }

        // Load reference image for potential retries
        const referenceImage = await loadUserReferenceImage(uid);
        const referenceImages = referenceImage ? [referenceImage] : undefined;

        // Process each batch result in parallel for speed
        const imageProcessingResults = await Promise.allSettled(
            results.map(async ({ index, result }) => {
                if (!result.buffer) {
                    console.warn(`[Phase2] No image buffer for ${postId}_msg${index} — safety filter or error`);
                    return { index, url: '' };
                }

                try {
                    // Resize to standard dimensions
                    const resizedBuffer = await sharp(result.buffer)
                        .resize(1280, 720, { fit: 'cover', position: 'center' })
                        .jpeg({ quality: 82 })
                        .toBuffer();

                    // Upload directly — skip per-image validation to avoid timeout.
                    // Batch API already applies safety filters; validation was the
                    // main cause of DEADLINE_EXCEEDED (extra API call per image).
                    const url = await uploadImageBuffer(resizedBuffer, `${postId}_msg${index}`);
                    return { index, url };
                } catch (err: any) {
                    console.error(`[Phase2] Error processing image ${postId}_msg${index}:`, err.message);
                    return { index, url: '' };
                }
            })
        );

        // Collect successful uploads
        for (const res of imageProcessingResults) {
            if (res.status === 'fulfilled' && res.value.url) {
                urls[res.value.index] = res.value.url;
            }
        }

        // Update the post
        const validUrls = urls.filter(Boolean);
        const firstImage = validUrls[0] || null;
        const allFilled = validUrls.length >= imagePrompts.length;
        const hasAudio = !!postData.audio_url;
        const isComplete = allFilled && hasAudio;

        await postDoc.ref.update({
            message_images: urls.map(u => u || null),
            imagen_urls: validUrls,
            images_complete: allFilled,
            ...(firstImage && { imagen_url: firstImage }),
            ...(isComplete && visibility !== 'private' && { is_public: true }),
        });

        console.log(`[Phase2] Post ${postId}: ${validUrls.length}/${imagePrompts.length} images${allFilled ? ' ✅ complete' : `, ${imagePrompts.length - validUrls.length} remaining`}`);
    } catch (err: any) {
        console.error(`[Phase2] Error updating post ${postId}:`, err.message);
    }
}
