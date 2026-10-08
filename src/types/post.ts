import type { Timestamp } from "firebase/firestore";
import type { SerializedTimestamp } from "@/lib/posts/timestamps";

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}

export interface CondensedTranscriptMessage {
    role: 'user' | 'ideal_self';
    text: string;
}

export interface WordTimestamp {
    word: string;
    start: number;
    end: number;
}

export interface AudioMessageBoundary {
    role: string;
    startIndex: number;
    endIndex: number;
    startTime: number;
    endTime: number;
}

export type PostVisibility = 'private' | 'community' | 'public';

/**
 * A post as the feed APIs serve it to the client (and as FeedPostCard renders it).
 * API serializers may send null for absent fields; the UI only checks truthiness.
 */
export interface Post {
    id: string;
    uid?: string;
    authorId?: string;

    pseudonym?: string;
    letter?: string;
    response?: string;
    counsel?: string;
    rant?: string;

    conversation_messages?: ConversationMessage[];
    content_raw?: string;
    public_post?: {
        pseudonym?: string;
        letter?: string;
        response?: string;
        imagen_url?: string;
        condensed_transcript?: CondensedTranscriptMessage[];
    };
    imageUrl?: string;
    imagen_url?: string;
    imagen_urls?: string[];
    message_images?: string[];
    image_style?: 'per-message';
    user_photo_url?: string;
    thumbnail_url?: string;
    /** false while the post's images are still being generated in the background. */
    images_complete?: boolean;

    sponsored_by?: string;
    sponsored_link?: string;
    region?: string;
    language?: string;
    title?: string;
    created_at: Timestamp | SerializedTimestamp | null;
    is_public?: boolean;
    visibility?: PostVisibility;
    isLikedByMe?: boolean;
    like_count?: number;
    author_avatar_url?: string;
    author_title?: string;
    comments?: number;
    audio_url?: string;
    audio_letter_ratio?: number;
    audio_word_timestamps?: WordTimestamp[];
    audio_message_boundaries?: AudioMessageBoundary[];
    letter_audio_url?: string;
    response_audio_url?: string;
    // Q&A short format fields
    short_question?: string;
    short_answer?: string;
    short_audio_url?: string;
    short_audio_word_timestamps?: WordTimestamp[];
    short_audio_letter_ratio?: number;
    shareToken?: string;
}

/** A comment as /api/posts/comments returns it. */
export interface PostComment {
    id: string;
    content: string;
    type?: string;
    is_mine?: boolean;
    author_title?: string;
    author_avatar_url?: string | null;
    created_at: unknown;
}
