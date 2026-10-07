import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { FieldValue } from 'firebase-admin/firestore';

export const maxDuration = 10;

/**
 * Save the user's personal comment on a post (visible only to them).
 *
 * The generateAIComment Cloud Function picks up the new comment and has the
 * user's character leave a public comment on a random post by someone else.
 */
export async function POST(req: Request) {
    try {
        // 1. Authenticate
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        // Rate limit: 10 comments per minute per user (each one triggers an AI comment)
        const rl = checkRateLimit(`comment:${uid}`, { maxRequests: 10, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { postId, comment } = await req.json();
        if (!postId || !comment?.trim()) {
            return Response.json({ error: 'Missing postId or comment' }, { status: 400 });
        }

        // 2. Fetch commenter's avatar and title
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};
        const identity = userData.identity;
        const bible = userData.character_bible;
        const authorTitle = userData.defining_words?.join(', ') || identity?.title || bible?.source_code?.archetype || 'Someone';
        const authorAvatarUrl = userData.avatar?.url || null;

        // 3. Save the user's personal comment (visible only to them)
        const personalComment = {
            commenter_uid: uid,
            author_title: authorTitle,
            author_avatar_url: authorAvatarUrl,
            content: comment.trim(),
            type: 'personal', // Only visible to the commenter
            created_at: FieldValue.serverTimestamp(),
        };

        await db.collection('posts').doc(postId).collection('comments').add(personalComment);

        // Increment comment count on this post
        await db.collection('posts').doc(postId).update({
            comments: FieldValue.increment(1),
        });

        return Response.json({
            success: true,
            author_title: authorTitle,
            author_avatar_url: authorAvatarUrl,
        });
    } catch (error) {
        console.error('[Comment] Error:', error);
        return Response.json({ error: 'Failed to save comment' }, { status: 500 });
    }
}
