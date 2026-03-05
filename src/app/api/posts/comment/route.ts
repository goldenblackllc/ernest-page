import { db } from '@/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';
import { generateTextWithFallback, SONNET_MODEL } from '@/lib/ai/models';
import { FieldValue } from 'firebase-admin/firestore';

export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        // 1. Authenticate
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.split('Bearer ')[1];
        let uid: string;
        try {
            const decoded = await getAuth().verifyIdToken(idToken);
            uid = decoded.uid;
        } catch {
            return Response.json({ error: 'Invalid token' }, { status: 401 });
        }

        const { postId, comment } = await req.json();
        if (!postId || !comment?.trim()) {
            return Response.json({ error: 'Missing postId or comment' }, { status: 400 });
        }

        // 2. Fetch commenter's avatar and title
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data() || {};
        const identity = userData.identity;
        const bible = userData.character_bible;
        const authorTitle = identity?.title || bible?.source_code?.archetype || 'Someone';
        const authorAvatarUrl = bible?.compiled_output?.avatar_url || null;

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

        // 4. Generate AI comment in the background (fire-and-forget)
        const origin = new URL(req.url).origin;
        generateAIComment(uid, origin).catch(err =>
            console.error('[Comment] AI comment generation error:', err)
        );

        return Response.json({
            success: true,
            author_title: authorTitle,
            author_avatar_url: authorAvatarUrl,
        });
    } catch (error: any) {
        console.error('[Comment] Error:', error);
        return Response.json({ error: error.message || 'Failed to save comment' }, { status: 500 });
    }
}

async function generateAIComment(commenterUid: string, origin: string) {
    // 1. Fetch the commenter's character bible
    const userDoc = await db.collection('users').doc(commenterUid).get();
    if (!userDoc.exists) return;

    const userData = userDoc.data()!;
    const bible = userData.character_bible;
    const identity = userData.identity;

    if (!bible && !identity) return;

    const characterTitle = identity?.title || bible?.source_code?.archetype || 'A thoughtful person';
    const avatarUrl = bible?.compiled_output?.avatar_url || null;

    // Build a character voice excerpt from the bible
    const bibleExcerpt = bible?.compiled_output?.ideal
        ?.slice(0, 2)
        .map((s: any) => s.content?.substring(0, 200))
        .join('\n') || identity?.dream_self || '';

    // 2. Find a random recent public post (not by the commenter)
    const postsSnap = await db.collection('posts')
        .orderBy('created_at', 'desc')
        .limit(30)
        .get();

    const candidatePosts = postsSnap.docs.filter(doc => {
        const data = doc.data();
        return data.authorId !== commenterUid && data.is_public !== false;
    });

    if (candidatePosts.length === 0) return;

    // Pick a random one
    const targetDoc = candidatePosts[Math.floor(Math.random() * candidatePosts.length)];
    const targetData = targetDoc.data();
    const targetLetter = targetData.public_post?.letter || targetData.letter || targetData.tension || '';

    if (!targetLetter) return;

    // 3. Generate the AI comment
    const prompt = `You are "${characterTitle}". You are commenting on a post written by SOMEONE ELSE — a stranger. Read their post and leave a short, genuine comment (1-3 sentences) directed at the POST AUTHOR.

Character voice reference (use this for tone and style only):
${bibleExcerpt}

Post written by someone else:
"${targetLetter.substring(0, 500)}"

Rules:
- You are speaking TO THE POST AUTHOR, not to yourself or your own user.
- Be specific to the post content. Reference something in it.
- No generic comments ("great post!", "love this!", "so true!")
- Be encouraging but authentic to the character's voice
- Keep it under 50 words
- Write as a public comment on someone else's post. Casual, warm, real.
- Do not use quotation marks around your response
- If the post mentions a personal struggle, respond with empathy toward the AUTHOR of the post, not as if you are the one experiencing it`;

    try {
        const result = await generateTextWithFallback({
            primaryModelId: SONNET_MODEL,
            abortSignal: AbortSignal.timeout(30_000),
            prompt,
        });

        const aiComment = result.text?.trim();
        if (!aiComment) return;

        // 4. Save the AI comment to the target post
        await db.collection('posts').doc(targetDoc.id).collection('comments').add({
            commenter_uid: commenterUid,
            author_title: characterTitle,
            author_avatar_url: avatarUrl,
            content: aiComment,
            type: 'ai_generated', // Visible to everyone
            created_at: FieldValue.serverTimestamp(),
        });

        // Increment comment count on the target post
        await db.collection('posts').doc(targetDoc.id).update({
            comments: FieldValue.increment(1),
        });

        console.log(`[Comment] AI comment placed on post ${targetDoc.id} as "${characterTitle}"`);
    } catch (err) {
        console.error('[Comment] AI generation failed:', err);
    }
}
