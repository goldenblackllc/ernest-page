import { generateWithFallback, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';
import { z } from 'zod';

/**
 * Condensed Transcript Generator
 *
 * Takes a raw chat transcript and produces a cleaned, condensed conversation
 * that preserves the journey while being readable to a stranger.
 * 
 * Also performs editorial judgment (is_publishable) and language detection.
 * 
 * Used by both processChat (cloud function) and regenerate-post (admin).
 */

// ─── Zod Schema ──────────────────────────────────────────────────────────────

export const CondensedTranscriptSchema = z.discriminatedUnion('is_publishable', [
    z.object({
        is_publishable: z.literal(true),
        title: z.string().describe('A short, honest title (6-12 words) representing the user\'s initial question or want — what they walked in with'),
        messages: z.array(z.object({
            role: z.enum(['user', 'ideal_self']),
            text: z.string(),
        })).describe('The condensed conversation — alternating user and ideal_self messages'),
        editorial_note: z.string().describe('Brief note on what you preserved and what you cut'),
        language: z.string().optional().describe('Primary language of the conversation (e.g., "English", "Español", "日本語")'),
        reached_close: z.boolean().describe('Did the Ideal Self reach the CLOSE phase — naming the belief shift, assigning specific actions, and releasing the user with warmth? True only if the conversation completed its full arc. False if the user quit early, the conversation stalled, or it never progressed past surface-level Q&A.'),
    }),
    z.object({
        is_publishable: z.literal(false),
        title: z.string().optional(),
        messages: z.array(z.object({
            role: z.enum(['user', 'ideal_self']),
            text: z.string(),
        })).optional(),
        editorial_note: z.string().optional(),
        language: z.string().optional(),
        reached_close: z.boolean().optional().describe('Did the conversation reach the CLOSE phase?'),
    }),
]);

export type CondensedTranscript = z.infer<typeof CondensedTranscriptSchema>;

export interface CondensedMessage {
    role: 'user' | 'ideal_self';
    text: string;
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

const CONDENSED_TRANSCRIPT_PROMPT = `You are an editor. You're given a raw chat transcript between a person and their Ideal Self (an AI advisor). The transcript is often messy — stream of consciousness, repetition, circling, tangents.

STEP 1: EDITORIAL JUDGMENT
Determine if this transcript is worth publishing.
- is_publishable: false — Pleasantries ("Hi", "Thanks"), system tests, circular banter with no substance, or conversations where the user never states what they want or how they feel. If there's no real conversation, reject it.
- is_publishable: true — The user says something real. They have a want, a feeling, a situation, or a question. The bar is LOW — almost everything should be published. Only reject genuine garbage.

If is_publishable is false, return minimal data and stop.

STEP 2: REWRITE THE CONVERSATION
Your job: **rewrite the conversation so it's clean, condensed, and readable to a stranger.** Preserve the back-and-forth structure. Keep it as a conversation. Just make it a GOOD conversation — one that flows, makes sense, and captures the journey the person went through.

WHAT TO DO:
- The first user message must start with "Dear Earnest," — this sets up the advice column format so the reader expects a response.
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
- Do NOT reference the chat, the session, or the platform.

STEP 3: TITLE
- Write a short, honest title (6-12 words) that captures the user's INITIAL question or want — what they walked in with at the start of the conversation.
- The conversation often evolves — the deeper insight or core issue usually emerges later. But the title should reflect where they STARTED, not where they ended up. That's what a reader scanning the feed will relate to.
- Be direct and specific, not vague or clickbaity. "I keep putting off the hard conversation" is good. "Life advice" is bad.
- Use the user's own framing when possible.

STEP 4: DETECT LANGUAGE
- language: Detect the primary language of the conversation. Output the language name as it appears natively (e.g., 'English', 'Español', '日本語', 'Français').

STEP 5: SESSION COMPLETION
- reached_close: Did the Ideal Self reach the CLOSE phase of the conversation?
- A proper CLOSE is a FINAL structured sequence near the END of the conversation. It requires ALL of the following:
  (a) The Ideal Self explicitly named the OLD belief and the NEW empowered belief replacing it (e.g., "You believe X. The truth is Y."), AND
  (b) The Ideal Self assigned SPECIFIC PHYSICAL ACTIONS the user should take (not just insights or questions — actual things to do), AND
  (c) The Ideal Self's FINAL message was a RELEASE — a closing statement that does NOT end with a question, does NOT invite further exploration, and does NOT ask "what do you think?" or "how does that feel?" It ends the session with warmth and finality.
- CRITICAL: Deep insights, powerful observations, and penetrating questions are NOT a close. If the Ideal Self's last message ends with a question like "What's it like to hear that?" or "Does that resonate?" — that is mid-conversation, NOT a close. The Ideal Self was still working. Set false.
- CRITICAL: If the conversation simply stops (user closes the window) while the Ideal Self was still asking questions or exploring — that is NOT a close. The session was interrupted. Set false.
- Set true ONLY when the Ideal Self clearly finished its job and let the person go. When in doubt, set false.`;


// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Generate a condensed transcript from a raw chat transcript.
 * 
 * @param rawTranscript - The raw chat transcript (content_raw from Firestore)
 * @returns The condensed transcript with messages, editorial note, and language
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
