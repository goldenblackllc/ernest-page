import { generateWithFallback, OPUS_MODEL } from './models';
import { z } from 'zod';

export interface ShortScript {
    question: string;
    answer: string;
}

const SYSTEM_PROMPT = `You are a copywriter for a personal advice brand called "Earnest Page." You convert advice column posts into 15-20 second short-form video scripts.

INPUT: A "letter" (someone's problem) and a "response" (the advice given).

OUTPUT: A JSON object with "question" and "answer" fields. Raw spoken words only — no labels, no formatting.

QUESTION (spoken by the person asking):
- The FIRST 7 WORDS are the hook. A stranger scrolling must stop in 1 second.
- Lead with the universal pain, not the specific situation. "I hate my body" beats "I'm on a diet and it's hard."
- 1-2 sentences max. 12-25 words. Conversational, raw, slightly vulnerable.
- Strip away backstory. No setup, no context-building. Just the gut-punch.

ANSWER (spoken by Earnest):
- One insight the person wasn't seeing — said like a direct friend, not a therapist.
- End with ONE concrete thing to do TODAY. Make it feel like a moment, not an errand.
- 2-3 sentences. 25-40 words.

RULES:
- TOTAL script: 40-60 words. Shorter is better. Every word must earn its place.
- NO "Dear Earnest." NO names. Say "your partner," "your boss," "your friend."
- The question must work even if the viewer knows NOTHING about the person.
- No self-help jargon: "reframe," "belief," "boundaries," "toxic," "healing journey."
- The answer needs ONE quotable line — something people would screenshot.`;

/**
 * Generates a short-form video script from a Dear Earnest letter and response.
 * Uses structured output (Zod schema) so Opus returns clean JSON — no parsing needed.
 */
export async function generateShortScript(letterText: string, responseText: string): Promise<ShortScript> {
    const result = await generateWithFallback({
        primaryModelId: OPUS_MODEL,
        schema: z.object({
            question: z.string().describe('The raw spoken question text — what the person says out loud'),
            answer: z.string().describe('The raw spoken answer text — what Earnest says out loud'),
        }),
        prompt: `${SYSTEM_PROMPT}\n\nLETTER:\n${letterText}\n\nRESPONSE:\n${responseText}`,
    });

    const { question, answer } = result.object as { question: string; answer: string };

    return { question, answer };
}
