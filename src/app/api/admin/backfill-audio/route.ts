import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { generatePostAudio } from '@/lib/ai/postTTS';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/admin/backfill-audio
 *
 * Generates TTS audio for an existing post that doesn't have audio yet.
 * Requires the requesting user to be the post author.
 *
 * Body: { postId: string }
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { postId } = await req.json();
        if (!postId) {
            return NextResponse.json({ error: 'postId is required' }, { status: 400 });
        }

        // Fetch the post
        const postDoc = await db.collection('posts').doc(postId).get();
        if (!postDoc.exists) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        const postData = postDoc.data()!;

        // Verify ownership
        if (postData.authorId !== uid && postData.uid !== uid) {
            return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }

        // Check if audio already exists
        if (postData.letter_audio_url && postData.response_audio_url) {
            return NextResponse.json({
                success: true,
                message: 'Audio already exists',
                letter_audio_url: postData.letter_audio_url,
                response_audio_url: postData.response_audio_url,
            });
        }

        // Get letter and response text
        const letter = postData.public_post?.letter || postData.letter;
        const response = postData.public_post?.response || postData.response;

        if (!letter || !response) {
            return NextResponse.json({ error: 'Post has no letter/response content' }, { status: 400 });
        }

        // Get the character's voice ID
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        const voiceId = userData?.character_bible?.voice_id;

        if (!voiceId) {
            return NextResponse.json({ error: 'No voice configured for your character' }, { status: 400 });
        }

        // Generate audio
        console.log(`[BackfillAudio] Generating audio for post ${postId} with voice ${voiceId}`);
        const audioResult = await generatePostAudio(letter, response, voiceId, postId);

        if (!audioResult) {
            return NextResponse.json({ error: 'Audio generation failed' }, { status: 500 });
        }

        // Update the post document
        await postDoc.ref.update({
            letter_audio_url: audioResult.letterAudioUrl,
            response_audio_url: audioResult.responseAudioUrl,
        });

        console.log(`[BackfillAudio] Audio attached to post ${postId}`);

        return NextResponse.json({
            success: true,
            letter_audio_url: audioResult.letterAudioUrl,
            response_audio_url: audioResult.responseAudioUrl,
        });
    } catch (error: any) {
        console.error('[BackfillAudio] Error:', error);
        return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}
