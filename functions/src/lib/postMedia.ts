/**
 * A post's media (images, narrated audio, videos) are public files: anyone
 * with the URL can open them. So they exist only while the post is exposed,
 * meaning shared by link, community or public. So does the "Dear Earnest"
 * rewrite of the conversation, which is only for readers. A private post has
 * the original conversation and its thumbnail, which is safe to be public
 * (the Ideal Self doing the session's action, captioned with its insight; see
 * generateThumbnail.ts). The rest is made when the author shares it and
 * deleted when they stop (see postExposure.ts).
 */
import { db, storage } from './firebase/admin.js';
import { generatePostMedia } from './ai/processPostContent.js';
import { generateCondensedTranscript } from './ai/condensedTranscript.js';
import { generateMessageImages } from './ai/generatePostImage.js';
import { loadUserReferenceImage } from './ai/loadUserReferenceImage.js';
import { getCompiledBible } from './bible.js';
import { getPostAuthorId, savePostImages } from './posts.js';
import { computeAge } from './utils/parseBirthDate.js';
import { errorMessage } from './utils/errors.js';
import { matchSponsor } from './config/ecosystem.js';

type PostData = FirebaseFirestore.DocumentData;

/** Shared by link, or visible beyond its author. */
export function isPostExposed(post: PostData | undefined): boolean {
    if (!post) return false;
    const visibility = post.visibility || (post.is_public ? 'community' : 'private');
    return visibility !== 'private' || !!post.shareToken;
}

/** Every media URL a post document points at, except the thumbnail, which a private post keeps. */
export function postMediaUrls(post: PostData): string[] {
    const urls = [
        post.audio_url,
        post.letter_audio_url,
        post.imagen_url,
        ...(Array.isArray(post.imagen_urls) ? post.imagen_urls : []),
        ...(Array.isArray(post.message_images) ? post.message_images : []),
    ];
    return [...new Set(urls.filter((u): u is string => typeof u === 'string' && !!u))];
}

export function hasPostMedia(post: PostData): boolean {
    return postMediaUrls(post).length > 0;
}

/** Has anything made for readers: media or the rewrite of the conversation. */
export function hasReaderVersion(post: PostData): boolean {
    return hasPostMedia(post) || (post.public_post?.condensed_transcript?.length || 0) > 0;
}

/**
 * The object path of a file in `bucket`, from either URL form we store
 * (storage.googleapis.com/<bucket>/<path> or the Firebase download URL).
 * Null for anything else, so we never delete outside our bucket.
 */
export function storagePathFromUrl(url: string, bucket: string): string | null {
    let parsed: URL;
    try { parsed = new URL(url); } catch { return null; }
    if (parsed.hostname === 'storage.googleapis.com') {
        const prefix = `/${bucket}/`;
        return parsed.pathname.startsWith(prefix) ? decodeURIComponent(parsed.pathname.slice(prefix.length)) || null : null;
    }
    if (parsed.hostname === 'firebasestorage.googleapis.com') {
        const prefix = `/v0/b/${bucket}/o/`;
        return parsed.pathname.startsWith(prefix) ? decodeURIComponent(parsed.pathname.slice(prefix.length)) || null : null;
    }
    return null;
}

/** Post fields that describe media (besides the thumbnail), reset to "none yet". */
export const NO_MEDIA_FIELDS = {
    media_status: 'deferred',
    image_prompts: [],
    message_images: [],
    imagen_url: null,
    imagen_urls: [],
    images_complete: true,
    image_retries: 0,
    audio_url: null,
    letter_audio_url: null,
    audio_word_timestamps: null,
    audio_message_boundaries: null,
    audio_letter_ratio: null,
} as const;

/**
 * Delete a post's media files (not the thumbnail), including rendered videos,
 * except URLs in `keep` (new media saved at the same path). Missing files are fine.
 */
export async function deletePostMediaFiles(postId: string, post: PostData, keep: string[] = []): Promise<number> {
    const bucket = storage.bucket();
    const paths = postMediaUrls(post)
        .filter(url => !keep.includes(url))
        .map(url => storagePathFromUrl(url, bucket.name))
        .filter((p): p is string => !!p);
    paths.push(`videos/${postId}.mp4`, `videos/short-${postId}.mp4`);

    const results = await Promise.allSettled(paths.map(p => bucket.file(p).delete({ ignoreNotFound: true })));
    results.forEach((r, i) => {
        if (r.status === 'rejected') console.error(`[PostMedia] Could not delete ${paths[i]}:`, errorMessage(r.reason));
    });
    return results.filter(r => r.status === 'fulfilled').length;
}

export function buildDemographicHint(userData: PostData): string {
    const identity = userData?.identity;
    const gender = userData?.gender || identity?.gender || '';
    const ethnicity = userData?.ethnicity || identity?.ethnicity || '';
    const computedAge = computeAge(userData?.birthdate || identity?.birthdate);
    const demographicParts = [
        computedAge ? `approximately ${computedAge} years old` : '',
        ethnicity,
        gender,
    ].filter(Boolean);
    const dreamSelf = identity?.dream_self || '';
    const demographicTag = demographicParts.length > 0 ? demographicParts.join(', ') : '';
    return demographicTag
        ? `\nCHARACTER APPEARANCE — MANDATORY: The main character's fixed traits (face, ethnicity, age, gender): ${demographicTag}. You MUST include "${demographicTag}" in EVERY prompt. If you omit this, the generator will default to a generic adult.${dreamSelf ? `\nTheir ASPIRATIONAL self-presentation (use for LATER beats only — pivot, move, outcome): "${dreamSelf}"` : ''}\nTRANSFORMATION ARC: If the letter describes a physical state that differs from the aspirational self (e.g., overweight, exhausted, unkempt), show the character's ACTUAL current state in Beats 1-2 (struggle). Transition in Beat 3 (pivot). By Beats 4-5 (move, outcome), the character should embody their resolved/aspirational state. This visual transformation IS the story. The face stays the same — only the body, posture, and energy transform.`
        : '';
}

/** The rewrite fields, removed when a post goes back to private. */
export const NO_REWRITE_FIELDS = {
    'public_post.condensed_transcript': [],
    condensed_editorial_note: null,
} as const;

/**
 * Make the reader's version of a private post just shared or published: the
 * rewrite of the conversation (if it has none), then image prompts and audio
 * (and the thumbnail if it has none), then the images.
 */
export async function generateMediaForPost(postId: string, post: PostData): Promise<void> {
    const uid = getPostAuthorId(post);
    const userData = (await db.collection('users').doc(uid).get()).data() || {};

    let messages = post.public_post?.condensed_transcript || post.condensed_transcript || [];
    let rewriteFields: Record<string, unknown> = {};
    if (messages.length === 0) {
        if (!post.content_raw) throw new Error(`Post ${postId} has no conversation to rewrite`);
        const condensed = await generateCondensedTranscript(post.content_raw);
        if (!condensed.messages?.length) throw new Error(`Post ${postId}: the rewrite came back empty`);
        messages = condensed.messages;
        rewriteFields = {
            'public_post.condensed_transcript': messages,
            condensed_editorial_note: condensed.editorial_note || null,
            ...(condensed.language && { language: condensed.language }),
        };
    }

    const media = await generatePostMedia({
        messages,
        title: post.title || null,
        language: post.language || null,
        uid,
        postId,
        compiledBible: getCompiledBible(userData),
        demographicHint: buildDemographicHint(userData),
        characterVoiceId: userData.voice?.id || userData.character_bible?.voice_id,
        locale: userData.preferred_locale || 'en',
        thumbnailBrief: post.thumbnail_brief || null,
        thumbnail: !post.thumbnail_url,
        logPrefix: 'PostMedia',
    });

    const sponsor = matchSponsor(messages.map((m: { role: string; text: string }) => `${m.role === 'user' ? 'Person' : 'Consultant'}: ${m.text}`).join('\n'));

    await db.collection('posts').doc(postId).update({
        ...rewriteFields,
        sponsored_by: sponsor?.name || null,
        sponsored_link: sponsor?.link || null,
        media_status: 'ready',
        image_style: 'per-message',
        image_prompts: media.imagePrompts,
        message_images: [],
        images_complete: media.imagePrompts.length === 0,
        image_retries: 0,
        ...(media.thumbnailUrl ? { thumbnail_url: media.thumbnailUrl } : {}),
        ...media.audioFields,
    });

    if (media.imagePrompts.length > 0) {
        try {
            await generateImagesForPost(postId);
        } catch (err) {
            // processPostImages retries posts with images_complete false.
            console.error(`[PostMedia] Images failed for ${postId}; the scheduled job will retry:`, errorMessage(err));
        }
    }
}

/**
 * Generate any missing per-message images for a post and publish it once every
 * image and the audio exist. Throws if no image could be generated.
 */
export async function generateImagesForPost(postId: string): Promise<{ count: number; urls: string[] }> {
    const postDoc = await db.collection('posts').doc(postId).get();
    const postData = postDoc.data();
    if (!postData) throw new Error(`Post ${postId} not found`);

    const imagePrompts = postData.image_prompts;
    if (!imagePrompts || !Array.isArray(imagePrompts) || imagePrompts.length === 0) {
        throw new Error(`Post ${postId} has no image prompts`);
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
    if (!firstImage) throw new Error(`Failed to generate any images for post ${postId}`);

    // Only publishes when every image succeeded AND audio exists
    const { filledCount, complete, published } = await savePostImages(postId, postData, urls);
    console.log(`[GenImages] Updated post ${postId}: ${filledCount}/${imagePrompts.length} images, audio: ${!!postData.audio_url}, complete: ${complete}, published: ${published}`);
    return { count: filledCount, urls };
}
