/**
 * Writes the words of the person's identity (functions/src/lib/identity.ts):
 * its title, and a first sentence from the words chosen at sign-up.
 *
 * Shared with the website, whose bundler can't follow this file's imports of
 * other functions files, so callers pass in generateWithFallback (models.ts).
 */
import { z } from 'zod';
import type { generateWithFallback } from './models.js';
import type { Identity } from '../identity.js';

type Generate = typeof generateWithFallback;

/** Short, so a website route that waits on one still has time to save; callers fall back when it fails. */
const TIMEOUT_MS = 25_000;

/** The byline for an identity: a few words naming who the person is. */
export async function deriveIdentityTitle(text: string, generate: Generate): Promise<string> {
    const { object } = await generate({
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        schema: z.object({ title: z.string() }),
        prompt: `This is who a person decided to be, in their own words:

${text}

Name who they are in two to four words or short phrases, separated by commas, each starting with a capital letter, in the language they wrote in. It signs their posts and comments in a public feed, so leave out names, places and anything private.`,
    });
    return object.title.trim();
}

/** A first identity from the words someone chose at sign-up. The words, joined, are its title. */
export async function identityFromWords(words: string[], generate: Generate): Promise<Identity> {
    const title = words.join(', ');
    const { object } = await generate({
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
        schema: z.object({ text: z.string() }),
        prompt: `Someone chose these words for who they are: ${title}

Write them as one sentence about themselves, in the first person and the present tense, starting with "I am" in the language of the words. Use their words, adding only what the grammar needs.`,
    });
    return { text: object.text.trim() || title, title };
}
