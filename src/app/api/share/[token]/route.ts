import { db } from "@/lib/firebase/admin";

/**
 * GET /api/share/:token — Fetch a shared post by token.
 * 
 * No auth required — this is the public endpoint for shared post viewing.
 * Returns sanitized public post data (no PII, no raw content).
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;

        if (!token || token.length < 8) {
            return Response.json({ error: "Invalid token" }, { status: 400 });
        }

        // Look up the post by shareToken
        const snapshot = await db
            .collection("posts")
            .where("shareToken", "==", token)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return Response.json({ error: "Post not found" }, { status: 404 });
        }

        const postDoc = snapshot.docs[0];
        const data = postDoc.data();

        // Return sanitized public data — same shape as /api/posts/[id]
        // but without the is_public gate
        const post: any = {
            id: postDoc.id,
            public_post: data.public_post || {},
            title: data.title || data.public_post?.title || null,
            imagen_url: data.imagen_url || null,
            imagen_urls: data.imagen_urls || null,
            message_images: data.message_images || null,
            image_style: data.image_style || null,
            thumbnail_url: data.thumbnail_url || null,
            user_photo_url: data.user_photo_url || null,
            hero_source: data.hero_source || null,
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
            region: data.region || null,
            sponsored_by: data.sponsored_by || null,
            sponsored_link: data.sponsored_link || null,
            created_at: data.created_at?._seconds
                ? { _seconds: data.created_at._seconds, _nanoseconds: data.created_at._nanoseconds || 0 }
                : null,
        };

        // Fetch author avatar (anonymous — no uid or name exposed)
        if (data.authorId || data.uid) {
            try {
                const authorDoc = await db.collection("users").doc(data.authorId || data.uid).get();
                if (authorDoc.exists) {
                    const authorData = authorDoc.data();
                    post.author_avatar_url = authorData?.avatar?.url || null;
                    post.author_title = authorData?.identity?.title || null;
                }
            } catch { /* silent */ }
        }

        return Response.json({ post });
    } catch (error: any) {
        console.error("Share fetch error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}
