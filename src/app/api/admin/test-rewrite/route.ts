import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { generateWithFallback, SONNET_MODEL } from '@/lib/ai/models';
import { generatePostAudio } from '@/lib/ai/postTTS';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/admin/test-rewrite
 *
 * Experimental: re-ghost-writes a post's raw transcript using the two-pass
 * letter/response pipeline. Returns the rewritten letter + response + TTS
 * audio for A/B comparison against the original post.
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

        // Need the raw transcript
        const transcript = postData.content_raw;
        if (!transcript) {
            return NextResponse.json({ error: 'Post has no raw transcript' }, { status: 400 });
        }

        // Fetch user data for character bible + voice
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];
        const voiceId = userData?.character_bible?.voice_id;

        // ══════════════════════════════════════════════════
        // TWO-PASS PIPELINE (mirrors cleanup-chats logic)
        // ══════════════════════════════════════════════════

        // ── Pass 1: Letter ──
        const letterPrompt = `You are the Executive Editor of an elite advice and lifestyle column on a mainstream social media app. You just received this raw chat transcript between a user (Character B) and their Ideal Self (Character A).

CHARACTER BIBLE:
${JSON.stringify(compiledBible)}

CHAT TRANSCRIPT:
${transcript}

Your ONLY writing job is the LETTER — the user's side. You are NOT writing Earnest's response. That comes later in a separate step.

Identify the user's opening state:
- INTENTION: What did they want? This comes from their first 1-2 messages. It is often vague, muddy, inarticulate — people don't arrive saying "I want happiness but don't know how." They arrive saying "I'm feeling weird today, I don't know, just kind of off."
- OBSTACLE: What was in the way? This often surfaces in the MIDDLE of the conversation, drawn out by Character A's questioning. Look for the moment the user says something raw or specific that they didn't plan to say.

YOUR EDITORIAL MANDATE: Crystallize the user's messy opening into the letter they WOULD have written if they could articulate it that clearly. This is not invention — it is editorial work. Dear Abby letters are edited too. Take the confused, stream-of-consciousness opening and render it as a clean, emotionally honest letter. Preserve the confusion and tension they came in with. Do NOT resolve it.

- title: Write a curiosity-driven hook title (8-15 words). Combine INTENTION and OBSTACLE as unresolved tension. The title must NEVER include the resolution. Never use second person.
- pseudonym: A clever 2-3 word sign-off (e.g., 'Curious Creator').

PII SCRUBBING — THIS IS NON-NEGOTIABLE:
Replace ALL real names with relationship roles, all specific places/companies with generic labels. The post must be fully anonymous.

- letter: LENGTH: 60-80 words MAXIMUM. STRUCTURE: One sentence stating what the person wants (INTENTION). Two-three sentences on what's blocking them (OBSTACLE). One closing line of raw emotional honesty. The letter must present the struggle as UNRESOLVED — as if the conversation hasn't happened yet. If you include ANY resolution, reframe, or insight, you have failed. VOICE: Write in first person, present tense. NEVER reference the chat or session. FORMATTING: Start exactly with 'Dear Earnest Page,\\n\\n'. Write the body. End with '\\n\\nSincerely,\\n' followed by the pseudonym.`;

        const letterResult = await generateWithFallback({
            primaryModelId: SONNET_MODEL,
            schema: z.object({
                title: z.string(),
                pseudonym: z.string(),
                letter: z.string(),
            }),
            prompt: letterPrompt,
        });

        const pass1 = letterResult.object as any;

        // ── Pass 2: Response ──
        const responsePrompt = `You are writing as Earnest Page — an advice columnist. You have just received the following letter. Now write your response.

CHARACTER BIBLE (this is Earnest Page's voice and worldview — write in this voice):
${JSON.stringify(compiledBible)}

THE LETTER:
${pass1.letter}

CHAT TRANSCRIPT (for context — the resolution that emerged in this conversation):
${transcript}

YOUR JOB: Write Earnest Page's response to this letter. The letter captures the user's unresolved tension. The conversation transcript shows how it was resolved. Your response delivers that resolution — warm, specific, in Character A's exact voice.

PII SCRUBBING — THIS IS NON-NEGOTIABLE:
Replace ALL real names with relationship roles, all specific places/companies with generic labels.

- response: LENGTH: 60-80 words MAXIMUM. STRUCTURE: One sentence acknowledging the tension from the letter. Two-three sentences delivering the reframe or insight that emerged in the conversation. One closing line with a direct instruction or challenge. Write strictly in Character A's exact voice. FORMATTING: Start with 'Dear ${pass1.pseudonym},\\n\\n'. Write the body. End with '\\n\\nSincerely,\\nEarnest Page'.`;

        const responseResult = await generateWithFallback({
            primaryModelId: SONNET_MODEL,
            schema: z.object({
                response: z.string(),
            }),
            prompt: responsePrompt,
        });

        const pass2 = responseResult.object as any;

        // ── Generate TTS audio if voice available ──
        let audioUrl: string | null = null;
        if (voiceId && pass1.letter && pass2.response) {
            try {
                const audioResult = await generatePostAudio(
                    pass1.letter,
                    pass2.response,
                    voiceId,
                    `rewrite_test_${postId}_${Date.now()}`,
                );
                if (audioResult?.audioUrl) {
                    audioUrl = audioResult.audioUrl;
                }
            } catch (err) {
                console.error('[TestRewrite] Audio generation failed:', err);
            }
        }

        return NextResponse.json({
            success: true,
            title: pass1.title,
            pseudonym: pass1.pseudonym,
            letter: pass1.letter,
            response: pass2.response,
            audio_url: audioUrl,
        });
    } catch (error: any) {
        console.error('[TestRewrite] Error:', error);
        return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}
