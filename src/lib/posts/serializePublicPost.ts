import { db } from "@/lib/firebase/admin";

/**
 * Shapes a single post for anonymous public viewers (/api/posts/[id] and /api/share/[token]).
 * Allowlist only: no author uid, raw content, conversation, location or translation map.
 * Attaches the author's avatar and identity title.
 */
export async function serializePublicPost(id: string, data: Record<string, any>) {
    const post: Record<string, any> = {
        id,
        public_post: data.public_post || {},
        title: data.title || data.public_post?.title || null,
        imagen_url: data.imagen_url || null,
        imagen_urls: data.imagen_urls || null,
        message_images: data.message_images || null,
        image_style: data.image_style || null,
        thumbnail_url: data.thumbnail_url || null,
        user_photo_url: data.user_photo_url || null,
        hero_source: data.hero_source || null,
        photo_vibe: data.photo_vibe || null,
        audio_url: data.audio_url || null,
        audio_letter_ratio: data.audio_letter_ratio ?? null,
        audio_word_timestamps: data.audio_word_timestamps ?? null,
        audio_message_boundaries: data.audio_message_boundaries ?? null,
        // Legacy two-file format
        letter_audio_url: data.letter_audio_url || null,
        response_audio_url: data.response_audio_url || null,
        // Q&A short format
        short_question: data.short_question || null,
        short_answer: data.short_answer || null,
        short_audio_url: data.short_audio_url || null,
        short_audio_word_timestamps: data.short_audio_word_timestamps || null,
        short_audio_letter_ratio: data.short_audio_letter_ratio ?? null,
        short_audio_question_duration: data.short_audio_question_duration ?? null,
        short_audio_answer_duration: data.short_audio_answer_duration ?? null,
        short_video_url: data.short_video_url || null,
        // Metadata
        post_type: data.post_type || null,
        like_count: data.like_count || data.likes || 0,
        comments: data.comments || 0,
        language: data.language || null,
        sponsored_by: data.sponsored_by || null,
        sponsored_link: data.sponsored_link || null,
        created_at: data.created_at?._seconds
            ? { _seconds: data.created_at._seconds, _nanoseconds: data.created_at._nanoseconds || 0 }
            : null,
        author_avatar_url: null,
        author_title: null,
    };

    const authorId = data.authorId || data.uid;
    if (authorId) {
        try {
            const authorDoc = await db.collection("users").doc(authorId).get();
            if (authorDoc.exists) {
                const authorData = authorDoc.data();
                post.author_avatar_url = authorData?.avatar?.url || null;
                post.author_title = authorData?.identity?.title || null;
            }
        } catch (err) {
            console.warn("Failed to fetch author data:", err);
        }
    }

    return post;
}
