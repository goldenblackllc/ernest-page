import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { processPostContent } from '@/lib/ai/processPostContent';

export const runtime = 'nodejs';
export const maxDuration = 240;

/**
 * POST /api/admin/regenerate-post
 *
 * Regenerates EVERYTHING for an existing post using the same shared
 * pipeline as the cleanup-chats cron:
 *   1. Condensed transcript (from stored raw transcript)
 *   2. Per-message image prompts (AI visual director)
 *   3. Dual-voice TTS audio
 *   4. Actual image generation (inline — not deferred like cron)
 *
 * Requires the post to have `content_raw` (the original chat transcript).
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

        const transcript = postData.content_raw;
        if (!transcript) {
            return NextResponse.json({ error: 'Post has no stored transcript (content_raw) — cannot regenerate' }, { status: 400 });
        }

        // Fetch user data for character bible and voice
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        if (!userData) {
            return NextResponse.json({ error: 'User data not found' }, { status: 404 });
        }

        const characterVoiceId = userData?.character_bible?.voice_id;
        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];
        const identity = userData?.identity;
        const gender = identity?.gender || '';

        // Build demographic hint for image prompts
        const age = identity?.birthdate ? (() => {
            const bd = new Date(identity.birthdate);
            return Math.floor((Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        })() : null;
        const demographicHint = [
            identity?.gender,
            age ? `approximately ${age} years old` : null,
            identity?.ethnicity,
        ].filter(Boolean).join(', ');

        console.log(`[RegeneratePost] Starting full regeneration for post ${postId}`);

        // ── STEP 1+2+3: Shared pipeline (condensed + prompts + TTS) ──
        // Same function the cron uses — no separate pipeline to maintain
        const pipelineResult = await processPostContent({
            transcript,
            uid,
            postId,
            compiledBible,
            demographicHint,
            characterVoiceId,
            gender,
            logPrefix: 'RegeneratePost',
        });

        if (!pipelineResult) {
            return NextResponse.json({ error: 'Transcript not publishable' }, { status: 400 });
        }

        const { condensed, imagePrompts, audioFields, derivedLetter, derivedResponse } = pipelineResult;

        // ── STEP 4: Update the post with text + audio ──
        const updateData: Record<string, any> = {
            title: condensed.title,
            public_post: {
                letter: derivedLetter,
                response: derivedResponse,
                condensed_transcript: condensed.messages,
            },
            condensed_transcript: condensed.messages,
            condensed_editorial_note: condensed.editorial_note,
            // Per-message image system — prompts saved, images generated via Cloud Function
            image_style: 'per-message',
            image_prompts: imagePrompts,
            message_images: [],           // Cloud Function will fill these in
            image_retries: 0,             // Reset retry counter
            // Clear legacy images
            imagen_url: null,
            imagen_urls: [],
            visual_style: null,
            language: condensed.language,
        };

        // Audio fields
        if (audioFields.audio_url) {
            Object.assign(updateData, audioFields);
        }

        // Keep post hidden until images are generated
        updateData.is_public = false;

        await postDoc.ref.update(updateData);

        // ── STEP 5: Trigger Cloud Function for image generation (fire-and-forget) ──
        const cloudFunctionUrl = process.env.GENERATE_POST_IMAGES_URL;
        if (cloudFunctionUrl) {
            fetch(cloudFunctionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: { postId } }),
            }).catch(err => console.error('[RegeneratePost] Cloud Function trigger failed:', err));
            console.log(`[RegeneratePost] Triggered image generation Cloud Function for ${postId}`);
        } else {
            console.warn(`[RegeneratePost] GENERATE_POST_IMAGES_URL not set — images will not be generated`);
        }

        console.log(`[RegeneratePost] Complete for ${postId} (messages: ${condensed.messages.length}, audio: ${!!audioFields.audio_url}, prompts: ${imagePrompts.length})`);

        return NextResponse.json({
            success: true,
            title: condensed.title,
            message_count: condensed.messages.length,
            audio_regenerated: !!audioFields.audio_url,
            image_prompts_saved: imagePrompts.length,
            images_generating: true,
        });
    } catch (error: any) {
        console.error('[RegeneratePost] Error:', error);
        return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}
