import type { Post } from "@/types/post";

/**
 * The audio a card plays. Condensed-transcript posts use the conversation audio
 * (audio_url) rather than the short Q&A clip; the word timestamps follow the same choice.
 */
export function getPostAudio(post: Post) {
    const hasCondensedTranscript = Boolean(post.public_post?.condensed_transcript?.length);
    const unifiedAudioUrl = hasCondensedTranscript
        ? (post.audio_url || post.short_audio_url)
        : (post.short_audio_url || post.audio_url);
    const wordTimestamps = hasCondensedTranscript
        ? (post.audio_word_timestamps || post.short_audio_word_timestamps)
        : (post.short_audio_word_timestamps || post.audio_word_timestamps);
    const legacyHasAudio = Boolean(post.letter_audio_url && post.response_audio_url);
    return {
        unifiedAudioUrl,
        wordTimestamps,
        hasAudio: Boolean(unifiedAudioUrl) || legacyHasAudio,
    };
}

/** Fraction of the audio taken by the letter: stored ratio, else estimated from word counts. */
export function getLetterRatio(post: Post, letter: string, response: string): number {
    if (post.short_audio_letter_ratio != null) return post.short_audio_letter_ratio;
    if (post.audio_letter_ratio != null) return post.audio_letter_ratio;
    const lw = letter.split(/\s+/).filter(Boolean).length;
    const rw = response.split(/\s+/).filter(Boolean).length;
    const total = lw + rw;
    return total > 0 ? lw / total : 0.5;
}

/**
 * The images a card shows. Per-message posts use one image per message; otherwise the
 * user photo (if any) comes first, then the AI images. Images are generated in the
 * background, so a post can have none yet.
 */
export function getPostImages(post: Post) {
    const heroUrl = post.thumbnail_url || post.user_photo_url || post.public_post?.imagen_url || post.imagen_url;
    const isPerMessage = Boolean(post.image_style === 'per-message' && post.message_images?.length);
    const imageUrls: string[] = (() => {
        if (isPerMessage) return post.message_images!;
        const aiImages = post.imagen_urls?.length ? post.imagen_urls : (post.imagen_url ? [post.imagen_url] : []);
        if (post.user_photo_url) return [post.user_photo_url, ...aiImages];
        return aiImages;
    })();
    return {
        heroUrl,
        imageUrls,
        isPerMessage,
        hasImage: Boolean(heroUrl) || imageUrls.length > 0,
    };
}
