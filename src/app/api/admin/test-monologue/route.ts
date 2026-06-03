import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { generateWithFallback, SONNET_MODEL } from '@/lib/ai/models';
import { generatePostAudio } from '@/lib/ai/postTTS';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/admin/test-monologue
 *
 * Experimental: re-ghost-writes a post's raw transcript as a first-person
 * inner monologue (merging Character A's voice with the user's). Returns
 * the monologue text + TTS audio URL for A/B comparison.
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

        // ── Generate monologue via AI ──
        const monologuePrompt = `You are the Executive Editor of an elite lifestyle column on a social media app. You just received this raw chat transcript between a user (Character B) and their Ideal Self (Character A).

IMPORTANT CONTEXT: Character A IS the user's Ideal Self — not an external advisor. Their words represent the user's own inner wisdom and clarity. This is one person's internal journey, not a conversation between two separate people.

CHARACTER BIBLE:
${JSON.stringify(compiledBible)}

CHAT TRANSCRIPT:
${transcript}

YOUR TASK: Convert this conversation into a first-person INNER MONOLOGUE — as if the user is narrating their own thought process.

Character A's questions become the user's self-reflection ("I asked myself...","Then a thought hit me...").
Character A's insights become the user's own realization ("And I realized...", "That's when it clicked...").
The user's answers remain their own words, lightly polished.

RULES:
- LENGTH: 100-140 words MAXIMUM. This will be read aloud as a 60-second audio short.
- VOICE: First person, present tense. The user is narrating this moment RIGHT NOW.
- STRUCTURE: Follow the natural arc of the conversation:
  1. Open with where the user started (their vague desire or question)
  2. Show the self-questioning that drew out the real answer
  3. Land on the reframe or insight — the moment of clarity
- TONE: Intimate, honest, like overhearing someone's private journal. Not polished. Not performative. Real.
- NEVER reference "my Ideal Self", "the character", "the session", or "the chat"
- NEVER use second person
- Do NOT include any greeting or sign-off (no "Dear...", no "Sincerely")

PII SCRUBBING — THIS IS NON-NEGOTIABLE:
Replace ALL of the following with generic labels:
  • Real names → relationship roles ("my friend", "my partner", "my kids")
  • Specific companies, places, schools → generic ("my company", "my city")
  • Any identifying details (addresses, phone numbers, etc.)

Also generate:
- title: A curiosity-driven hook title (8-15 words). First person. Unresolved tension. Make someone stop scrolling.
- pseudonym: A clever 2-3 word sign-off.`;

        const result = await generateWithFallback({
            primaryModelId: SONNET_MODEL,
            schema: z.object({
                monologue: z.string().describe("The first-person inner monologue, 100-140 words"),
                title: z.string().describe("Hook title, 8-15 words"),
                pseudonym: z.string().describe("2-3 word sign-off"),
            }),
            prompt: monologuePrompt,
        });

        const output = result.object as any;

        // ── Generate TTS audio if voice available ──
        let audioUrl: string | null = null;
        if (voiceId && output.monologue) {
            try {
                const audioResult = await generatePostAudio(
                    output.monologue,
                    '',  // No response — single monologue track
                    voiceId,
                    `monologue_test_${postId}_${Date.now()}`,
                );
                if (audioResult?.audioUrl) {
                    audioUrl = audioResult.audioUrl;
                }
            } catch (err) {
                console.error('[TestMonologue] Audio generation failed:', err);
            }
        }

        return NextResponse.json({
            success: true,
            title: output.title,
            pseudonym: output.pseudonym,
            monologue: output.monologue,
            audio_url: audioUrl,
        });
    } catch (error: any) {
        console.error('[TestMonologue] Error:', error);
        return NextResponse.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}
