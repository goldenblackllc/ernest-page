/**
 * generateAIComment (Firestore trigger) — when a user leaves a personal comment,
 * their character leaves a public comment on a random recent post by someone else.
 *
 * Personal comments are written by the website's posts/comment API route.
 * Only `type: 'personal'` comments trigger this, so the AI comments it writes
 * don't trigger it again.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, FieldValue } from './lib/firebase/admin.js';
import { REGION } from './lib/config/region.js';
import { generateTextWithFallback, OPUS_MODEL } from './lib/ai/models.js';
import { getPostText } from './lib/getPostText.js';
import { getCompiledBible } from './lib/bible.js';
import { getPostAuthorId } from './lib/posts.js';

export const generateAIComment = onDocumentCreated(
    {
        document: 'posts/{postId}/comments/{commentId}',
        region: REGION,
        timeoutSeconds: 120,
        memory: '256MiB',
    },
    async (event) => {
        const comment = event.data?.data();
        if (comment?.type !== 'personal' || !comment.commenter_uid) return;

        await commentAsCharacter(comment.commenter_uid);
    }
);

async function commentAsCharacter(commenterUid: string): Promise<void> {
    // 1. Fetch the commenter's character bible
    const userDoc = await db.collection('users').doc(commenterUid).get();
    if (!userDoc.exists) return;

    const userData = userDoc.data()!;
    const bible = userData.character_bible;
    const identity = userData.identity;

    if (!bible && !identity && !userData.defining_words) return;

    const characterTitle = userData.defining_words?.join(', ') || identity?.title || bible?.source_code?.archetype || 'A thoughtful person';
    const avatarUrl = userData.avatar?.url || null;

    // Build a character voice excerpt from the bible
    const sections = getCompiledBible(userData);
    const bibleExcerpt = sections
        ?.slice(0, 2)
        .map(s => s.content?.substring(0, 200))
        .join('\n') || identity?.dream_self || '';

    // 2. Find a random recent public post (not by the commenter)
    const postsSnap = await db.collection('posts')
        .orderBy('created_at', 'desc')
        .limit(30)
        .get();

    const candidatePosts = postsSnap.docs.filter(doc => {
        const data = doc.data();
        return getPostAuthorId(data) !== commenterUid && data.is_public !== false;
    });

    if (candidatePosts.length === 0) return;

    // Pick a random one
    const targetDoc = candidatePosts[Math.floor(Math.random() * candidatePosts.length)];
    const { letter: targetLetter } = getPostText(targetDoc.data());

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
            primaryModelId: OPUS_MODEL,
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
