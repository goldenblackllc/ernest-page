/**
 * Voice Prompt Generator
 *
 * Generates an ElevenLabs Voice Design prompt from the character's manifesto
 * and user identity. Uses AI to determine the appropriate accent from the
 * manifesto's socioeconomic energy, then appends ethnicity as timbre-only.
 *
 * The prompt follows ElevenLabs' recommended format:
 * "Native <Language>. <Gender>, <Age range>. <Quality level>.
 *  Persona: <2-5 words>. Emotion: <2-3 adjectives>.
 *  <1-2 sentences about timbre, pacing, delivery>"
 */

import { generateWithFallback, SONNET_MODEL } from './models';
import { z } from 'zod';

interface VoicePromptInput {
    manifesto: string;
    archetype: string;
    characterName: string;
    gender: string;
    age: string;          // Birthday string, age number, or descriptive
    ethnicity: string;    // From identity — used for timbre only
    appLanguage: string;  // Current locale (e.g. 'en', 'es', 'fr')
}

const LANGUAGE_MAP: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    pt: 'Portuguese',
    it: 'Italian',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    ar: 'Arabic',
    hi: 'Hindi',
};

/**
 * Uses AI to generate an ElevenLabs voice design prompt from character data.
 * The AI determines accent from the manifesto and translates ethnicity into
 * timbral descriptors.
 */
export async function generateVoiceDesignPrompt(input: VoicePromptInput): Promise<string> {
    const language = LANGUAGE_MAP[input.appLanguage] || 'English';

    const result = await generateWithFallback({
        primaryModelId: SONNET_MODEL,
        abortSignal: AbortSignal.timeout(15_000),
        prompt: `You are generating a voice design prompt for ElevenLabs' Voice Design API. This prompt will be used to create a synthetic voice for a character.

The character is someone's Ideal Self. Here is their information:

Gender: "${input.gender}"
Age/Birthday: "${input.age}"
Ethnicity: "${input.ethnicity}"
Archetype: "${input.archetype}"
Character Name: "${input.characterName}"
App Language: "${language}"
Manifesto: "${input.manifesto.slice(0, 600)}"

Generate a voice design prompt following this EXACT format:
"Native <accent variant of ${language}>. <Gender>, <age range>. High quality.
Persona: <2-5 words from the manifesto's energy>. Emotion: <2-3 adjectives>.
<1-2 sentences about timbre, pacing, and delivery — concrete acoustic descriptors only, NO metaphors>.
${input.ethnicity ? `Ethnicity: ${input.ethnicity} without any accent.` : ''}"

RULES:
1. The accent (e.g. "British English" vs "American English") must come from the MANIFESTO's socioeconomic energy, NOT from the person's ethnicity. A refined, luxurious character gets British English. A self-made hustler gets American English. Match the character's aspirational identity.
2. If ethnicity is provided, append it as "Ethnicity: [value] without any accent." This preserves ethnic timbre without triggering an accent change.
3. If ethnicity is empty, omit the ethnicity line entirely.
4. Age range should be derived from the age/birthday field. Convert birthdays to approximate decade (e.g. "June 19, 1971" → "mid-50s").
5. Use ONLY concrete acoustic adjectives: rich, deep, bright, warm, crisp, melodious, resonant, smooth, full-bodied, clear. NO literary language like "makes you feel held" or "carries the weight of experience."
6. Keep delivery description to 1-2 SHORT sentences. Be direct.
7. Always specify "High quality."

Output ONLY the voice design prompt string. Nothing else.`,
        schema: z.object({
            voice_prompt: z.string().describe('The complete ElevenLabs voice design prompt'),
        }),
    });

    return (result.object as any).voice_prompt;
}
