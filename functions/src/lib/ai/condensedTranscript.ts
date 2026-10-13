import { generateWithFallback, OPUS_MODEL } from './models.js';
import { z } from 'zod';

/**
 * Condensed Transcript Generator
 *
 * Takes a raw chat transcript and produces a cleaned, condensed conversation
 * that preserves the journey while being readable to a stranger.
 * 
 * Also performs editorial judgment (is_publishable) and language detection.
 * 
 * Used by both cleanup-chats (cron) and regenerate-post (admin).
 */

// ─── Zod Schema ──────────────────────────────────────────────────────────────

/** The thumbnail: the Ideal Self doing the session's action, captioned with its insight. */
export const ThumbnailBriefSchema = z.object({
    insight: z.string().describe('The new belief the session arrived at, 2-5 words, calm and declarative, no names'),
    action: z.string().describe('The most visual action the person committed to, as a short plain phrase'),
    scene: z.string().describe('One or two sentences: a single photograph of the Ideal Self doing their own version of that action'),
});

export type ThumbnailBrief = z.infer<typeof ThumbnailBriefSchema>;

const CondensedTranscriptSchema = z.object({
    is_publishable: z.boolean().describe('Whether this transcript is worth publishing'),
    title: z.string().optional().describe('A punchy first-person hook (3-6 words) — raw, confessional, thumb-stopping'),
    messages: z.array(z.object({
        role: z.enum(['user', 'ideal_self']),
        text: z.string(),
    })).optional().describe('The condensed conversation — alternating user and ideal_self messages'),
    editorial_note: z.string().optional().describe('Brief note on what you preserved and what you cut'),
    language: z.string().optional().describe('Primary language of the conversation (e.g., "English", "Español", "日本語")'),
    thumbnail: ThumbnailBriefSchema.optional().describe('What the thumbnail shows: the insight as words, the action as the picture (STEP 6)'),
    reached_close: z.boolean().optional().describe('Did the Ideal Self reach the CLOSE phase — naming the belief shift, assigning specific actions, and releasing the user with warmth? True only if the conversation completed its full arc. False if the user quit early, the conversation stalled, or it never progressed past surface-level Q&A.'),
});

export type CondensedTranscript = z.infer<typeof CondensedTranscriptSchema>;

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
- Write a punchy first-person hook — 3 to 6 words MAX. This is a confession, not a description.
- Think tabloid-honest, gut-punch energy. The reader should feel something immediately.
- Good: "I'm a coward about conflict" · "I can't stop comparing" · "My anger scares me" · "I married the wrong person" · "I don't miss her"
- Bad: "Dealing with difficult emotions at work" · "How to handle a tough conversation" · "Life advice" · "Struggling with self-worth and confidence"
- Use "I" or "My" — this is the user's voice, first person, raw.
- Capture the emotional core, not the topic summary. What would this person blurt out after two drinks?
- Never exceed 6 words. Shorter is almost always better.

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
- Set true ONLY when the Ideal Self clearly finished its job and let the person go. When in doubt, set false.

STEP 6: THUMBNAIL BRIEF
The post's thumbnail shows the Ideal Self living the outcome of the conversation: the new belief as words, the chosen action as the picture. Strangers may see it, so it must reveal nothing personal.
- insight: The new, empowered belief the conversation arrived at, in 2 to 5 words, in the conversation's language. Calm and declarative, in the Ideal Self's voice. Not a question, not a teaser, not a confession. No names, places or private details.
  Good: "Enough, as I am" · "Allowed to rest" · "Safe in my own skin" · "My pace is the right pace"
  Bad: "Why I can't trust my dad" · "You won't believe this" · "My panic attacks" · "Finding inner peace through self-care"
- action: The one specific action the person committed to that is the most visual, or the most central to the close if none is visual. A short plain phrase. If no action was agreed, the everyday action that best expresses the insight.
- scene: One or two sentences describing a single photograph of the Ideal Self doing their own version of that action in their everyday life: the setting, the light, what they are doing, the mood. Show the action, never the problem or the conflict behind it. No other identifiable people: anyone else involved is out of frame or out of focus. No readable text, screens with words, names or brands in the scene.`;

// A private post keeps only the original conversation; the rewrite is made
// when it's shared (lib/postMedia.ts). Without it, STEP 2 is skipped.
const REWRITE_STEP = CONDENSED_TRANSCRIPT_PROMPT.slice(
    CONDENSED_TRANSCRIPT_PROMPT.indexOf('STEP 2: REWRITE THE CONVERSATION'),
    CONDENSED_TRANSCRIPT_PROMPT.indexOf('STEP 3: TITLE'),
);
const NO_REWRITE_PROMPT = CONDENSED_TRANSCRIPT_PROMPT.replace(
    REWRITE_STEP,
    'STEP 2: NO REWRITE\nDo not rewrite the conversation: return messages as an empty array. Every other step still reads the full transcript.\n\n',
);

// ─── Main Function ───────────────────────────────────────────────────────────

/**
 * Generate a condensed transcript from a raw chat transcript.
 * 
 * @param rawTranscript - The raw chat transcript (content_raw from Firestore)
 * @param options.rewrite - Rewrite the conversation (default true); false for a private post
 * @returns The condensed transcript with messages, editorial note, and language
 */
export async function generateCondensedTranscript(
    rawTranscript: string,
    { rewrite = true }: { rewrite?: boolean } = {},
): Promise<CondensedTranscript> {
    const result = await generateWithFallback({
        primaryModelId: OPUS_MODEL,
        schema: CondensedTranscriptSchema,
        prompt: `${rewrite ? CONDENSED_TRANSCRIPT_PROMPT : NO_REWRITE_PROMPT}\n\nTRANSCRIPT:\n${rawTranscript}`,
    });

    return result.object as CondensedTranscript;
}
