// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { deriveIdentityTitle, identityFromWords } from '../identity.js';
import type { generateWithFallback } from '../models.js';

/** Stands in for generateWithFallback, answering with the given object. */
const answering = (object: Record<string, string>) =>
    vi.fn<typeof generateWithFallback>().mockResolvedValue({ object } as never);

describe('deriveIdentityTitle', () => {
    it('asks for a title from who they decided to be, with a time limit, and trims it', async () => {
        const generate = answering({ title: '  Calm, Generous \n' });
        expect(await deriveIdentityTitle('I am calm and generous.', generate)).toBe('Calm, Generous');
        const [{ prompt, abortSignal }] = generate.mock.calls[0];
        expect(prompt).toContain('I am calm and generous.');
        expect(abortSignal).toBeInstanceOf(AbortSignal);
    });
});

describe('identityFromWords', () => {
    it('writes a sentence from the words, which joined are the title', async () => {
        const generate = answering({ text: ' I am a gentleman and a father. ' });
        expect(await identityFromWords(['Gentleman', 'Father'], generate))
            .toEqual({ text: 'I am a gentleman and a father.', title: 'Gentleman, Father' });
        expect(generate.mock.calls[0][0].prompt).toContain('Gentleman, Father');
    });

    it('uses the words as the sentence when the answer is empty', async () => {
        expect(await identityFromWords(['Gentleman'], answering({ text: '  ' })))
            .toEqual({ text: 'Gentleman', title: 'Gentleman' });
    });
});
