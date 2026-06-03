import { db } from "@/lib/firebase/admin";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const postDoc = await db.collection("posts").doc(id).get();
        if (!postDoc.exists) {
            return Response.json({ error: "Post not found" }, { status: 404 });
        }

        const data = postDoc.data()!;

        // Only serve public posts
        if (data.is_public !== true) {
            return Response.json({ error: "Post not found" }, { status: 404 });
        }

        // Return sanitized public data only — no PII, no raw content
        const post: any = {
            id: postDoc.id,
            public_post: data.public_post || {},
            imagen_url: data.imagen_url || null,
            audio_url: data.audio_url || null,
            audio_letter_ratio: data.audio_letter_ratio ?? null,
            // Legacy two-file format for backward compat with old posts
            letter_audio_url: data.letter_audio_url || null,
            response_audio_url: data.response_audio_url || null,
            photo_vibe: data.photo_vibe || null,
            likes: data.likes || 0,
            comments: data.comments || 0,
            language: data.language || null,
            sponsored_by: data.sponsored_by || null,
            sponsored_link: data.sponsored_link || null,
            created_at: data.created_at?._seconds
                ? { _seconds: data.created_at._seconds, _nanoseconds: data.created_at._nanoseconds || 0 }
                : null,
        };

        // Fetch author avatar
        if (data.authorId || data.uid) {
            try {
                const authorDoc = await db.collection("users").doc(data.authorId || data.uid).get();
                if (authorDoc.exists) {
                    const authorData = authorDoc.data();
                    post.author_avatar_url = authorData?.character_bible?.compiled_output?.avatar_url || null;
                }
            } catch { /* silent */ }
        }

        return Response.json({ post });
    } catch (error: any) {
        console.error("Post fetch error:", error);
        return Response.json({ error: "Server error" }, { status: 500 });
    }
}
