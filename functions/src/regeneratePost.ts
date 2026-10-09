/**
 * regeneratePost (callable) — rebuilds an existing post from its stored
 * transcript with the same pipeline as processChat: condensed transcript,
 * per-message image prompts, TTS audio, thumbnail, then the images.
 *
 * Author-only. Used by the regenerate button the post card shows on localhost.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './lib/firebase/admin.js';
import { REGION } from './lib/config/region.js';
import { processPostContent } from './lib/ai/processPostContent.js';
import { computeAge } from './lib/utils/parseBirthDate.js';
import { generateMessageImages } from './lib/ai/generatePostImage.js';
import { loadUserReferenceImage } from './lib/ai/loadUserReferenceImage.js';
import { getPostAuthorId, savePostImages } from './lib/posts.js';
import { getCompiledBible } from './lib/bible.js';
import { errorMessage } from './lib/utils/errors.js';

export const regeneratePost = onCall<{ postId: string }>(
    {
        region: REGION,
        timeoutSeconds: 540,
        memory: '1GiB',
    },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

        const { postId } = request.data || ({} as { postId?: string });
        if (!postId) throw new HttpsError('invalid-argument', 'postId is required');

        const postDoc = await db.collection('posts').doc(postId).get();
        const postData = postDoc.data();
        if (!postData) throw new HttpsError('not-found', 'Post not found');
        if (postData.authorId !== uid && postData.uid !== uid) throw new HttpsError('permission-denied', 'Not authorized');

        const transcript = postData.content_raw;
        if (!transcript) {
            throw new HttpsError('failed-precondition', 'Post has no stored transcript (content_raw) — cannot regenerate');
        }

        const userData = (await db.collection('users').doc(uid).get()).data();
        if (!userData) throw new HttpsError('not-found', 'User data not found');

        // Current user fields first, legacy nested fields as fallback (same as processChat)
        const identity = userData.identity;
        const gender = userData.gender || identity?.gender || '';
        const age = computeAge(userData.birthdate || identity?.birthdate);
        const demographicHint = [
            gender,
            age ? `approximately ${age} years old` : null,
            userData.ethnicity || identity?.ethnicity,
        ].filter(Boolean).join(', ');

        console.log(`[RegeneratePost] Starting full regeneration for post ${postId}`);

        const pipelineResult = await processPostContent({
            transcript,
            uid,
            postId,
            compiledBible: getCompiledBible(userData),
            demographicHint,
            characterVoiceId: userData.voice?.id || userData.character_bible?.voice_id,
            gender,
            locale: userData.preferred_locale || 'en',
            logPrefix: 'RegeneratePost',
        });
        if (!pipelineResult) throw new HttpsError('failed-precondition', 'Transcript not publishable');

        const { condensed, imagePrompts, audioFields, thumbnailUrl } = pipelineResult;

        await postDoc.ref.update({
            title: condensed.title,
            public_post: {
                ...(postData.public_post || {}),
                title: condensed.title || postData.public_post?.title || null,
                condensed_transcript: condensed.messages,
            },
            condensed_editorial_note: condensed.editorial_note,
            // Per-message image system — prompts saved, images generated below
            image_style: 'per-message',
            image_prompts: imagePrompts,
            message_images: [],
            images_complete: false, // the scheduled image job retries if generation below falls short
            image_retries: 0,
            // Clear legacy images
            imagen_url: null,
            imagen_urls: [],
            visual_style: null,
            language: condensed.language,
            ...(audioFields.audio_url ? audioFields : {}),
            ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {}),
            // Keep post hidden until images are generated
            is_public: false,
        });

        let imagesGenerated = 0;
        try {
            imagesGenerated = (await generateImagesForPost(postId)).count;
        } catch (err) {
            console.error(`[RegeneratePost] Image generation failed for ${postId} — scheduled job will retry:`, errorMessage(err));
        }

        console.log(`[RegeneratePost] Complete for ${postId} (messages: ${condensed.messages.length}, audio: ${!!audioFields.audio_url}, images: ${imagesGenerated}/${imagePrompts.length})`);

        return {
            success: true,
            title: condensed.title,
            message_count: condensed.messages.length,
            audio_regenerated: !!audioFields.audio_url,
            images_generated: imagesGenerated,
        };
    }
);

/**
 * Generate any missing per-message images for a post and publish it once every
 * image and the audio exist. Throws if no image could be generated.
 */
async function generateImagesForPost(postId: string): Promise<{ count: number; urls: string[] }> {
    const postDoc = await db.collection('posts').doc(postId).get();
    const postData = postDoc.data();
    if (!postData) throw new HttpsError('not-found', 'Post not found');

    const imagePrompts = postData.image_prompts;
    if (!imagePrompts || !Array.isArray(imagePrompts) || imagePrompts.length === 0) {
        throw new HttpsError('failed-precondition', 'Post has no image prompts');
    }

    console.log(`[GenImages] Generating images for post ${postId}`);
    const uid = getPostAuthorId(postData);
    const referenceImage = await loadUserReferenceImage(uid);
    const referenceImages = referenceImage ? [referenceImage] : undefined;

    const urls = await generateMessageImages({
        prompts: imagePrompts,
        uid,
        filePrefix: postId,
        referenceImages,
        existingUrls: postData.message_images,
    });

    const firstImage = urls.find(Boolean) || null;
    if (!firstImage) {
        console.error(`[GenImages] Failed to generate any images for post ${postId}`);
        throw new HttpsError('internal', 'Failed to generate images');
    }

    // Only publishes when every image succeeded AND audio exists
    const { filledCount, complete, published } = await savePostImages(postId, postData, urls);
    console.log(`[GenImages] Updated post ${postId}: ${filledCount}/${imagePrompts.length} images, audio: ${!!postData.audio_url}, complete: ${complete}, published: ${published}`);
    return { count: filledCount, urls };
}
