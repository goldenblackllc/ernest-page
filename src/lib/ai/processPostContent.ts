/**
 * processPostContent.ts
 *
 * Shared post-processing pipeline used by both the processChat cloud function
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

import { generateCondensedTranscript } from '@/lib/ai/condensedTranscript';
import { generateMessageImagePrompts } from '@/lib/ai/generatePostImage';
import { generateConversationAudio, resolveConversationVoices } from '@/lib/ai/postTTS';
import { generateThumbnail } from '@/lib/ai/generateThumbnail';

export interface ProcessPostInput {
    /** Raw chat transcript (role: content lines) */
    transcript: string;
    /** User ID */
    uid: string;
    /** Post document ID (used for TTS file naming) */
    postId: string;
    /** Compiled character bible sections */
    compiledBible?: any[];
    /** Demographic appearance hint for image prompts */
    demographicHint: string;
    /** User's cloned voice ID for TTS */
    characterVoiceId?: string;
    /** Use the character voice for both roles (monologue mode — e.g. daily digest) */
    singleVoice?: boolean;
    /** User's gender (for voice selection) */
    gender: string;
    /** Log prefix for console output */
    logPrefix?: string;
    /** User's preferred locale / language code (e.g. 'en', 'es') */
    locale?: string;
    /**
     * Pre-generated condensed transcript. If provided, skips the
     * condensed transcript generation step (cron already has it).
     */
    preCondensed?: {
        messages: Array<{ role: 'user' | 'ideal_self'; text: string }>;
        title?: string | null;
        language?: string | null;
        editorial_note?: string | null;
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
    };
    /** One image prompt per condensed transcript message */
    imagePrompts: string[];
    /** Audio fields ready to spread into the post document */
    audioFields: Record<string, any>;
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
        gender,
        logPrefix = 'ProcessPost',
        preCondensed,
    } = opts;

    // ── Step 1: Generate or reuse condensed transcript ──
    let messages: Array<{ role: 'user' | 'ideal_self'; text: string }>;
    let title: string | null = null;
    let language: string | null = null;
    let editorialNote: string | null = null;

    if (preCondensed) {
        // Caller already has condensed messages (e.g. cron)
        messages = preCondensed.messages;
        title = preCondensed.title || null;
        language = preCondensed.language || null;
        editorialNote = preCondensed.editorial_note || null;
        console.log(`[${logPrefix}] Using pre-condensed transcript: ${messages.length} messages`);
    } else {
        // Generate fresh (e.g. regenerate button)
        console.log(`[${logPrefix}] Generating condensed transcript...`);
        const condensed = await generateCondensedTranscript(transcript);

        if (!condensed.is_publishable || !condensed.messages || condensed.messages.length === 0) {
            console.log(`[${logPrefix}] Transcript not publishable — skipping`);
            return null;
        }

        messages = condensed.messages;
        title = condensed.title || null;
        language = condensed.language || null;
        editorialNote = condensed.editorial_note || null;
        console.log(`[${logPrefix}] Condensed: ${messages.length} messages, title: "${title}"`);
    }



    // ── Steps 2 + 3 + 4: Image prompts + TTS + Thumbnail (in parallel) ──

    const imagePromptsPromise = generateMessageImagePrompts({
        messages,
        compiledBible,
        demographicHint,
    });

    const audioFields: Record<string, any> = {};
    const ttsPromise = (characterVoiceId && messages.length > 0)
        ? (async () => {
            let questionerVoiceId = characterVoiceId;
            let resolvedCharacterVoiceId = characterVoiceId;

            if (singleVoice) {
                // Monologue mode (e.g. daily digest): same voice for both roles
                console.log(`[${logPrefix}] Single-voice mode — using character voice for both roles`);
            } else {
                const voiceLanguage = opts.locale || language || 'en';
                const voices = await resolveConversationVoices(characterVoiceId, voiceLanguage);
                if (voices) {
                    questionerVoiceId = voices.questionerVoiceId;
                    resolvedCharacterVoiceId = voices.characterVoiceId;
                }
            }

            console.log(`[${logPrefix}] Generating ${singleVoice ? 'single' : 'dual'}-voice audio...`);
            const audioResult = await generateConversationAudio(
                messages,
                questionerVoiceId,
                resolvedCharacterVoiceId,
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
        })()
        : Promise.resolve();

    const thumbnailPromise = generateThumbnail({
        messages,
        title,
        uid,
        postId,
        logPrefix,
    });

    const [imagePromptsResult, , thumbnailUrl] = await Promise.all([
        imagePromptsPromise,
        ttsPromise,
        thumbnailPromise,
    ]);

    const imagePrompts = imagePromptsResult || [];
    console.log(`[${logPrefix}] Complete — ${messages.length} messages, ${imagePrompts.length} prompts, audio: ${!!audioFields.audio_url}, thumbnail: ${!!thumbnailUrl}`);

    return {
        condensed: {
            is_publishable: true,
            messages,
            title,
            language,
            editorial_note: editorialNote,
        },
        imagePrompts,
        audioFields,
        thumbnailUrl: thumbnailUrl || null,
    };
}
