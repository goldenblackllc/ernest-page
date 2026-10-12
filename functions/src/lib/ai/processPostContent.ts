/**
 * processPostContent.ts
 *
 * Shared post-processing pipeline used by both the cleanup-chats cron
 * and the regenerate-post endpoint.
 *
 * Takes a raw transcript and produces:
 *   1. Condensed transcript (ghost-written conversation)
 *   2. Per-message image prompts (AI visual director)
 *   3. TTS audio (dual-voice conversation)
 *
 * Callers decide what to do with the result — create a new post
 * (cron) or update an existing one (regenerate).
 */

import { generateCondensedTranscript, type ThumbnailBrief } from './condensedTranscript.js';
import { generateMessageImagePrompts } from './generatePostImage.js';
import { generateConversationAudio, resolveConversationVoices, type MessageBoundary, type WordTimestamp } from './postTTS.js';
import type { BibleSection } from '../bible.js';
import { generateThumbnail } from './generateThumbnail.js';

/** Audio fields spread into a post document. */
export interface PostAudioFields {
    audio_url?: string;
    audio_word_timestamps?: WordTimestamp[];
    audio_message_boundaries?: MessageBoundary[];
    audio_letter_ratio?: number;
}

export interface ProcessPostInput {
    /** Raw chat transcript (role: content lines) */
    transcript: string;
    /** User ID */
    uid: string;
    /** Post document ID (used for TTS file naming) */
    postId: string;
    /** Compiled character bible sections */
    compiledBible?: BibleSection[];
    /** Demographic appearance hint for image prompts */
    demographicHint: string;
    /** User's cloned voice ID for TTS */
    characterVoiceId?: string;
    /** User's gender (for voice selection) */
    gender: string;
    /** Use the character voice for both roles (monologue mode — e.g. daily digest) */
    singleVoice?: boolean;
    /** Log prefix for console output */
    logPrefix?: string;
    /** User's preferred locale / language code (e.g. 'en', 'es') */
    locale?: string;
    /**
     * Pre-generated condensed transcript. If provided, skips the
     * condensed transcript generation step (cron already has it).
     */
    /**
     * 'full' (default): image prompts, audio and thumbnail. 'thumbnail': the
     * thumbnail only, for a private post (the rest is made when it's shared,
     * see lib/postMedia.ts).
     */
    media?: 'full' | 'thumbnail';
    preCondensed?: {
        messages: Array<{ role: 'user' | 'ideal_self'; text: string }>;
        title?: string | null;
        language?: string | null;
        editorial_note?: string | null;
        thumbnail?: ThumbnailBrief | null;
    };
}

export interface ProcessPostResult {
    /** Condensed transcript data */
    condensed: {
        is_publishable: boolean;
        messages: Array<{ role: 'user' | 'ideal_self'; text: string }>;
        title: string | null;
        language: string | null;
        editorial_note: string | null;
        thumbnail: ThumbnailBrief | null;
    };
    /** One image prompt per condensed transcript message */
    imagePrompts: string[];
    /** Audio fields ready to spread into the post document */
    audioFields: PostAudioFields;
    /** Public URL of the generated thumbnail image, or null */
    thumbnailUrl: string | null;
}

/**
 * Process a raw chat transcript into publishable content.
 *
 * Runs three AI operations in parallel:
 *   1. Condensed transcript (editorial ghost-writing)
 *   2. Per-message image prompts (visual director)
 *   3. Dual-voice TTS audio
 *
 * Returns null if the transcript is not publishable.
 */
export async function processPostContent(
    opts: ProcessPostInput
): Promise<ProcessPostResult | null> {
    const {
        transcript,
        uid,
        postId,
        compiledBible,
        demographicHint,
        characterVoiceId,
        singleVoice,
        logPrefix = 'ProcessPost',
        preCondensed,
    } = opts;

    // ── Step 1: Generate or reuse condensed transcript ──
    let messages: Array<{ role: 'user' | 'ideal_self'; text: string }>;
    let title: string | null = null;
    let language: string | null = null;
    let editorialNote: string | null = null;
    let thumbnail: ThumbnailBrief | null = null;

    if (preCondensed) {
        // Caller already has condensed messages (e.g. cron)
        messages = preCondensed.messages;
        title = preCondensed.title || null;
        language = preCondensed.language || null;
        editorialNote = preCondensed.editorial_note || null;
        thumbnail = preCondensed.thumbnail || null;
        console.log(`[${logPrefix}] Using pre-condensed transcript: ${messages.length} messages`);
    } else {
        // Generate fresh (e.g. regenerate button)
        console.log(`[${logPrefix}] Generating condensed transcript...`);
        // A private post skips the rewrite; it's made when the post is shared
        const rewrite = (opts.media ?? 'full') === 'full';
        const condensed = await generateCondensedTranscript(transcript, { rewrite });

        if (!condensed.is_publishable || (rewrite && (!condensed.messages || condensed.messages.length === 0))) {
            console.log(`[${logPrefix}] Transcript not publishable — skipping`);
            return null;
        }

        messages = condensed.messages || [];
        title = condensed.title || null;
        language = condensed.language || null;
        editorialNote = condensed.editorial_note || null;
        thumbnail = condensed.thumbnail || null;
        console.log(`[${logPrefix}] Condensed: ${messages.length} messages, title: "${title}"`);
    }

    // ── Steps 2 + 3 + 4: Image prompts + TTS + Thumbnail ──
    // A private post gets only its thumbnail: media files are public URLs, so
    // the rest is made when the author shares it (see postExposure.ts).
    const { imagePrompts, audioFields, thumbnailUrl } = await generatePostMedia({
        messages, title, language, uid, postId, compiledBible, demographicHint,
        characterVoiceId, singleVoice, locale: opts.locale, logPrefix,
        thumbnailBrief: thumbnail,
        audioAndImages: (opts.media ?? 'full') === 'full',
    });
    console.log(`[${logPrefix}] Complete — ${messages.length} messages, ${imagePrompts.length} prompts, audio: ${!!audioFields.audio_url}, thumbnail: ${!!thumbnailUrl}`);

    return {
        condensed: {
            is_publishable: true,
            messages,
            title,
            language,
            editorial_note: editorialNote,
            thumbnail,
        },
        imagePrompts,
        audioFields,
        thumbnailUrl,
    };
}

export interface PostMediaInput {
    messages: Array<{ role: 'user' | 'ideal_self'; text: string }>;
    title: string | null;
    language: string | null;
    uid: string;
    postId: string;
    compiledBible?: BibleSection[];
    demographicHint: string;
    characterVoiceId?: string;
    singleVoice?: boolean;
    locale?: string;
    logPrefix?: string;
    /** Insight, action and scene for the thumbnail (posts; the digest has none) */
    thumbnailBrief?: ThumbnailBrief | null;
    /** Make the thumbnail (default true) */
    thumbnail?: boolean;
    /** Make image prompts and audio (default true) */
    audioAndImages?: boolean;
}

export interface PostMedia {
    imagePrompts: string[];
    audioFields: PostAudioFields;
    thumbnailUrl: string | null;
}

/** Image prompts, TTS audio and thumbnail for a condensed conversation (in parallel). */
export async function generatePostMedia(input: PostMediaInput): Promise<PostMedia> {
    const {
        messages, title, language, uid, postId, compiledBible, demographicHint, characterVoiceId, singleVoice, locale,
        thumbnailBrief, thumbnail = true, audioAndImages = true, logPrefix = 'ProcessPost',
    } = input;

    const imagePromptsPromise = audioAndImages
        ? generateMessageImagePrompts({ messages, compiledBible, demographicHint })
        : Promise.resolve([]);

    const audioFields: PostAudioFields = {};
    const ttsPromise = (audioAndImages && characterVoiceId && messages.length > 0)
        ? (async () => {
            // Monologue mode (e.g. daily digest): character voice for both roles
            const voiceLanguage = locale || language || 'en';
            const voices = singleVoice
                ? { questionerVoiceId: characterVoiceId, characterVoiceId }
                : await resolveConversationVoices(characterVoiceId, voiceLanguage);

            if (voices) {
                console.log(`[${logPrefix}] Generating ${singleVoice ? 'single' : 'dual'}-voice audio...`);
                const audioResult = await generateConversationAudio(
                    messages,
                    voices.questionerVoiceId,
                    voices.characterVoiceId,
                    postId,
                );
                if (audioResult) {
                    audioFields.audio_url = audioResult.audioUrl;
                    audioFields.audio_word_timestamps = audioResult.wordTimestamps;
                    audioFields.audio_message_boundaries = audioResult.messageBoundaries;
                    audioFields.audio_letter_ratio =
                        audioResult.messageBoundaries[0]?.endTime /
                        audioResult.messageBoundaries[audioResult.messageBoundaries.length - 1]?.endTime || 0.5;
                    console.log(`[${logPrefix}] Audio generated for ${postId}`);
                }
            }
        })()
        : Promise.resolve();

    const thumbnailPromise = thumbnail
        ? generateThumbnail({ messages, title, uid, postId, brief: thumbnailBrief, logPrefix })
        : Promise.resolve(null);

    const [imagePromptsResult, , thumbnailUrl] = await Promise.all([
        imagePromptsPromise,
        ttsPromise,
        thumbnailPromise,
    ]);

    return { imagePrompts: imagePromptsResult || [], audioFields, thumbnailUrl: thumbnailUrl || null };
}
