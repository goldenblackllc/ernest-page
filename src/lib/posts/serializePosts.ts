import type { DocumentData } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

/**
 * Shapes raw post documents for a given viewer, mirroring the feed route:
 * - attaches author avatar + identity title
 * - strips private fields (raw content, conversation) from posts the viewer doesn't own
 * - normalizes created_at to { _seconds, _nanoseconds }
 */
export async function serializePostsForViewer(
    posts: Array<{ id: string } & DocumentData>,
    uid: string,
): Promise<DocumentData[]> {
    const authorIds = [...new Set(posts.map(p => p.authorId || p.uid).filter(Boolean))];
    const avatarMap: Record<string, string> = {};
    const titleMap: Record<string, string> = {};

    if (authorIds.length > 0) {
        try {
            const authorDocs = await db.getAll(...authorIds.map(id => db.collection("users").doc(id)));
            authorDocs.forEach((doc) => {
                if (!doc.exists) return;
                const data = doc.data();
                if (data?.avatar?.url) avatarMap[doc.id] = data.avatar.url;
                if (data?.identity?.title) titleMap[doc.id] = data.identity.title;
            });
        } catch (err) {
            console.warn("Failed to batch-fetch author data:", err);
        }
    }

    return posts.map((post) => {
        const authorId = post.authorId || post.uid;
        const isOwner = post.authorId === uid || post.uid === uid;
        const clean: DocumentData = { ...post };

        clean.author_avatar_url = avatarMap[authorId] || null;
        clean.author_title = titleMap[authorId] || null;

        delete clean.likedBy;
        delete clean.imagen_prompt;

        if (!isOwner) {
            delete clean.content_raw;
            delete clean.rant;
            delete clean.conversation_messages;
            delete clean.counsel;
        }
        delete clean.translations;

        if (clean.created_at && clean.created_at._seconds !== undefined) {
            clean.created_at = {
                _seconds: clean.created_at._seconds,
                _nanoseconds: clean.created_at._nanoseconds || 0,
            };
        }

        return clean;
    });
}
