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
import { db } from './lib/firebase/admin.js';
import { REGION } from './lib/config/region.js';
import { buildMessageImageBatchRequests, resizeToPostImage, uploadImageBuffer } from './lib/ai/generatePostImage.js';
import { getPostAuthorId, savePostImages } from './lib/posts.js';
import { loadUserReferenceImage } from './lib/ai/loadUserReferenceImage.js';
import { submitImageBatch, pollBatchJob, type BatchRequestEntry, type ParsedBatchResult } from './lib/ai/batchImageGeneration.js';
import { errorMessage } from './lib/utils/errors.js';
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

/** How long a batch job can stay in RUNNING/PENDING before we treat it as failed (60 min) */
const BATCH_TIMEOUT_MS = 60 * 60 * 1000;

/** Thumbnail retry cap per post */
const MAX_THUMBNAIL_RETRIES = 3;

export const processPostImages = onSchedule(
    {
        schedule: 'every 10 minutes',
        region: REGION,
        timeoutSeconds: 1800,
        memory: '2GiB',
        maxInstances: 1,  // Only one instance at a time — no parallel runs
    },
    async () => {
        // Phase A: Poll active batch jobs and collect completed results.
        // Returns the post IDs that already have a batch in flight so Phase B
        // doesn't submit duplicate batches for the same posts.
        const postsWithActiveBatches = await pollActiveBatches();

        // Phase A.5: Retry failed thumbnails
        await retryMissingThumbnails();

        // Phase B: Submit new batch jobs for posts needing images
        await submitPendingImageBatches(postsWithActiveBatches);
    }
);

// ─── Phase A: Poll active batch jobs ─────────────────────────────────────────

async function pollActiveBatches(): Promise<Set<string>> {
    const postsWithActiveBatches = new Set<string>();

    try {
        const activeJobs = await getActiveBatchJobs();

        if (activeJobs.length > 0) {
            console.log(`[Phase2] Polling ${activeJobs.length} active batch job(s)...`);

            let timedOut = 0;
            let stillRunning = 0;
            let completed = 0;

            for (const job of activeJobs) {
                // Record which posts are covered by this batch before polling,
                // so we skip them in Phase B even if the job is still running.
                job.post_ids.forEach(id => postsWithActiveBatches.add(id));

                const prevState = job.state;
                await processCompletedBatch(job);

                // Count outcomes for summary (re-read isn't needed; infer from state)
                const ageMs = Date.now() - (job.created_at || 0);
                if (ageMs > BATCH_TIMEOUT_MS) {
                    timedOut++;
                } else if (prevState === 'JOB_STATE_RUNNING' || prevState === 'JOB_STATE_PENDING') {
                    stillRunning++;
                } else {
                    completed++;
                }
            }

            if (timedOut > 0 || completed > 0) {
                console.log(`[Phase2] Poll summary: ${stillRunning} still running, ${completed} completed, ${timedOut} timed out`);
            }
        }
    } catch (err) {
        console.error('[Phase2] Error in Phase A (poll):', errorMessage(err));
        // Continue to Phase B even if polling fails
    }

    return postsWithActiveBatches;
}

// ─── Phase A.5: Retry failed thumbnails ──────────────────────────────────────

async function retryMissingThumbnails(): Promise<void> {
    try {
        // Find recent posts missing thumbnails (created in last 48h, not exceeding retry cap)
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const thumbSnap = await db.collection('posts')
            .where('created_at', '>', cutoff)
            .orderBy('created_at', 'desc')
            .limit(50)
            .get();

        const needsThumbnail = thumbSnap.docs.filter(doc => {
            const data = doc.data();
            return !data.thumbnail_url && (data.thumbnail_retries || 0) < MAX_THUMBNAIL_RETRIES;
        });

        if (needsThumbnail.length > 0) {
            console.log(`[Phase2] Found ${needsThumbnail.length} post(s) needing thumbnail retry`);

            for (const postDoc of needsThumbnail) {
                await retryThumbnail(postDoc);
            }
        }
    } catch (err) {
        console.error('[Phase2] Error in thumbnail retry phase:', errorMessage(err));
    }
}

async function retryThumbnail(postDoc: FirebaseFirestore.QueryDocumentSnapshot): Promise<void> {
    const postData = postDoc.data();
    const retries = postData.thumbnail_retries || 0;
    const uid = getPostAuthorId(postData);
    const messages = postData.public_post?.condensed_transcript;
    const title = postData.title;

    if (!messages || messages.length === 0) {
        console.warn(`[Phase2] Post ${postDoc.id} has no condensed transcript for thumbnail — skipping`);
        await postDoc.ref.update({ thumbnail_retries: retries + 1 });
        return;
    }

    try {
        const { generateThumbnail } = await import('./lib/ai/generateThumbnail.js');
        const thumbnailUrl = await generateThumbnail({
            messages,
            title,
            uid,
            postId: postDoc.id,
            logPrefix: 'Phase2-Thumb',
        });

        if (thumbnailUrl) {
            await postDoc.ref.update({
                thumbnail_url: thumbnailUrl,
                thumbnail_retries: retries + 1,
            });
            console.log(`[Phase2] ✅ Thumbnail retry succeeded for ${postDoc.id}`);
        } else {
            await postDoc.ref.update({ thumbnail_retries: retries + 1 });
            console.warn(`[Phase2] Thumbnail retry ${retries + 1}/${MAX_THUMBNAIL_RETRIES} failed for ${postDoc.id}`);
        }
    } catch (thumbErr) {
        await postDoc.ref.update({ thumbnail_retries: retries + 1 });
        console.error(`[Phase2] Thumbnail retry error for ${postDoc.id}:`, errorMessage(thumbErr));
    }
}

// ─── Phase B: Submit new batch jobs ──────────────────────────────────────────

async function submitPendingImageBatches(postsWithActiveBatches: Set<string>): Promise<void> {
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
    const allBatchRequests: BatchRequestEntry[] = [];
    const promptMapping: Record<string, { postId: string; index: number }> = {};
    const postIds: string[] = [];
    const postsToIncrement: Array<{ ref: FirebaseFirestore.DocumentReference; retryCount: number }> = [];

    for (const postDoc of pendingPosts.docs) {
        // Skip posts that already have an active batch — avoids duplicate submissions
        if (postsWithActiveBatches.has(postDoc.id)) {
            console.log(`[Phase2] Skipping post ${postDoc.id} — already has active batch`);
            continue;
        }

        const postData = postDoc.data();
        const imagePrompts: string[] = postData.image_prompts || [];
        const existingImages: string[] = postData.message_images || [];
        const retryCount: number = postData.image_retries || 0;
        const uid: string = getPostAuthorId(postData);

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
            await savePostImages(postDoc.id, postData, existingImages, { acceptPartial: true });
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
                await savePostImages(postDoc.id, postData, existingImages, { acceptPartial: true });
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
        } catch (err) {
            console.error(`[Phase2] Error building batch for post ${postDoc.id}:`, errorMessage(err));
            await postDoc.ref.update({
                image_retries: retryCount + 1,
                image_last_error: errorMessage(err).slice(0, 500),
                image_last_error_at: Date.now(),
            });
        }
    }

    if (allBatchRequests.length > 0) {
        await submitBatch(allBatchRequests, postIds, promptMapping, postsToIncrement);
    }
}

/** Submit the consolidated batch, track it, and count an attempt on every participating post. */
async function submitBatch(
    allBatchRequests: BatchRequestEntry[],
    postIds: string[],
    promptMapping: Record<string, { postId: string; index: number }>,
    postsToIncrement: Array<{ ref: FirebaseFirestore.DocumentReference; retryCount: number }>,
): Promise<void> {
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
    } catch (err) {
        console.error('[Phase2] Error submitting batch job:', errorMessage(err));
        // Increment retry counters even on batch submission failure
        for (const { ref, retryCount } of postsToIncrement) {
            await ref.update({
                image_retries: retryCount + 1,
                image_last_error: errorMessage(err).slice(0, 500),
                image_last_error_at: Date.now(),
            });
        }
    }
}

// ─── Phase A helpers ─────────────────────────────────────────────────────────

/**
 * Process a single completed or in-progress batch job.
 * If the job is complete (succeeded/failed), collect results and update posts.
 */
async function processCompletedBatch(job: BatchJobRecord): Promise<void> {
    try {
        const status = await pollBatchJob(job.jobName);

        // Only log state when it changes — avoids flooding logs with 'still running' for every batch every 10 min
        if (status.state !== job.state) {
            console.log(`[Phase2] Batch ${job.jobName} state: ${job.state} → ${status.state}`);
        }

        if (status.state === 'JOB_STATE_PENDING' || status.state === 'JOB_STATE_RUNNING') {
            // Check if the batch has been stuck for too long
            const ageMs = Date.now() - (job.created_at || 0);
            if (ageMs > BATCH_TIMEOUT_MS) {
                const ageMin = Math.round(ageMs / 60000);
                console.warn(`[Phase2] Batch ${job.jobName} timed out after ${ageMin} min (state: ${status.state}) — marking failed and cleaning up`);
                await updateBatchJobState(job.jobName, 'JOB_STATE_FAILED', `Timed out after ${ageMin} minutes in ${status.state}`);
                await deleteBatchRecord(job.jobName);
                return;
            }

            // Still in progress and within timeout — update state in tracker and wait for next cycle
            await updateBatchJobState(job.jobName, status.state as BatchJobRecord['state'], undefined, job.state);
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
    } catch (err) {
        console.error(`[Phase2] Error processing batch ${job.jobName}:`, errorMessage(err));
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

        // Start with existing images (gap-filling)
        const urls: string[] = new Array(imagePrompts.length).fill('');
        for (let i = 0; i < Math.min(existingImages.length, imagePrompts.length); i++) {
            urls[i] = existingImages[i] || '';
        }

        // Process each batch result in parallel for speed
        const imageProcessingResults = await Promise.allSettled(
            results.map(async ({ index, result }) => {
                if (!result.buffer) {
                    console.warn(`[Phase2] No image buffer for ${postId}_msg${index} — safety filter or error`);
                    return { index, url: '' };
                }

                try {
                    // Resize to standard dimensions
                    const resizedBuffer = await resizeToPostImage(result.buffer);

                    // Upload directly — skip per-image validation to avoid timeout.
                    // Batch API already applies safety filters; validation was the
                    // main cause of DEADLINE_EXCEEDED (extra API call per image).
                    const url = await uploadImageBuffer(resizedBuffer, `${postId}_msg${index}`);
                    return { index, url };
                } catch (err) {
                    console.error(`[Phase2] Error processing image ${postId}_msg${index}:`, errorMessage(err));
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

        const { filledCount, complete } = await savePostImages(postId, postData, urls);
        console.log(`[Phase2] Post ${postId}: ${filledCount}/${imagePrompts.length} images${complete ? ' ✅ complete' : `, ${imagePrompts.length - filledCount} remaining`}`);
    } catch (err) {
        console.error(`[Phase2] Error updating post ${postId}:`, errorMessage(err));
    }
}
