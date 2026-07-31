import { generateWithFallback, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';
import { z } from 'zod';

/**
 * Condensed Transcript Generator
 *
 * Takes a raw chat transcript and produces a cleaned, condensed conversation
 * that preserves the journey while being readable to a stranger.
 * 
 * Used by both cleanup-chats (cron) and regenerate-post (admin).
 */

// ─── Zod Schema ──────────────────────────────────────────────────────────────

export const CondensedTranscriptSchema = z.object({
    pseudonym: z.string().describe('Clever 2-3 word pseudonym for the user, e.g. "Curious Creator"'),
    messages: z.array(z.object({
        role: z.enum(['user', 'ideal_self']),
        text: z.string(),
    })).describe('The condensed conversation — alternating user and ideal_self messages'),
    editorial_note: z.string().describe('Brief note on what you preserved and what you cut'),
});

export type CondensedTranscript = z.infer<typeof CondensedTranscriptSchema>;

export interface CondensedMessage {
    role: 'user' | 'ideal_self';
    text: string;
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

const CONDENSED_TRANSCRIPT_PROMPT = `You are an editor. You're given a raw chat transcript between a person and their Ideal Self (an AI advisor). The transcript is often messy — stream of consciousness, repetition, circling, tangents.

Your job: **rewrite the conversation so it's clean, condensed, and readable to a stranger.** Preserve the back-and-forth structure. Keep it as a conversation. Just make it a GOOD conversation — one that flows, makes sense, and captures the journey the person went through.

WHAT TO DO:
- Cut the fat: repetition, filler, circling, tangents that go nowhere.
- Clean up the user's stream-of-consciousness into clear, natural sentences — but keep their voice and their real words where possible.
- Preserve the Ideal Self's key insights and the moments where something shifts for the user.
- Keep the natural flow of the conversation. The person's want or understanding may change as the conversation progresses — that's the whole point. Don't flatten the journey into a single question and answer.
- Use as many or as few messages as the conversation needs. Some are 4 messages. Some are 15. Let the content decide.

SELF-CONTAINMENT:
- A stranger who has NEVER seen the original transcript must be able to follow every message.
- No detail or reference may appear unless it was stated in a prior message within this condensed version.
- The Ideal Self cannot reference things from the transcript that haven't come up yet in the condensed version.
- Every pronoun must have a clear antecedent within the conversation.

PII SCRUBBING:
- Replace names of people the user personally knows with relationship roles ("my son", "my partner", "my boss").
- Keep public figures, brands, and cultural references verbatim.

TONE:
- The Ideal Self should sound like a direct, wise friend — not a therapist. No jargon: "boundaries", "trauma", "healing journey", "reframe", "belief system" are BANNED.
- Keep the user's actual words and phrasing where possible. The authenticity matters.
- Do NOT reference the chat, the session, or the platform.`;

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Generate a condensed transcript from a raw chat transcript.
 * 
 * @param rawTranscript - The raw chat transcript (content_raw from Firestore)
 * @returns The condensed transcript with pseudonym, messages, and editorial note
 */
export async function generateCondensedTranscript(
    rawTranscript: string,
): Promise<CondensedTranscript> {
    const result = await generateWithFallback({
        primaryModelId: OPUS_MODEL,
        fallbackModelId: OPUS_FALLBACK,
        schema: CondensedTranscriptSchema,
        prompt: `${CONDENSED_TRANSCRIPT_PROMPT}\n\nTRANSCRIPT:\n${rawTranscript}`,
    });

    return result.object as CondensedTranscript;
}
