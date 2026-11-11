// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ generateTextWithFallback: vi.fn() }));

vi.mock('firebase-functions/v2/firestore', () => ({
    onDocumentCreated: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('../lib/ai/models.js', () => ({
    generateTextWithFallback: h.generateTextWithFallback,
    OPUS_MODEL: 'test-model',
}));

import { polishNowPost } from '../now.js';
import { buildPolishPrompt } from '../lib/ai/nowPolishPrompt.js';

const handler = polishNowPost as unknown as (e: ReturnType<typeof event>) => Promise<void>;

function event(post: Record<string, unknown> | undefined) {
    const update = vi.fn().mockResolvedValue(undefined);
    return {
        data: post ? { data: () => post, ref: { update } } : undefined,
        params: { uid: 'u1', postId: 'p1' },
        update,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    h.generateTextWithFallback.mockResolvedValue({ text: '  Went further than I meant to.  ' });
});

describe('polishNowPost', () => {
    it('saves the polished words beside the person’s own', async () => {
        const e = event({ action: 'Walk', raw_text: 'went further then i ment to', polish: true });
        await handler(e);
        expect(h.generateTextWithFallback).toHaveBeenCalledWith(expect.objectContaining({
            primaryModelId: 'test-model',
            prompt: buildPolishPrompt('Walk', 'went further then i ment to'),
        }));
        expect(e.update).toHaveBeenCalledWith({ polished_text: 'Went further than I meant to.' });
    });

    it('does nothing when Polish was not ticked, there is no text, or it is already polished', async () => {
        for (const post of [
            { action: 'Walk', raw_text: 'went out', polish: false },
            { action: 'Walk', raw_text: '', polish: true },
            { action: 'Walk', raw_text: 'went out', polish: true, polished_text: 'Went out.' },
        ]) {
            const e = event(post);
            await handler(e);
            expect(e.update).not.toHaveBeenCalled();
        }
        expect(h.generateTextWithFallback).not.toHaveBeenCalled();
    });

    it('keeps the person’s own words when the model fails or answers with nothing', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        h.generateTextWithFallback.mockRejectedValueOnce(new Error('overloaded'));
        const failed = event({ action: 'Walk', raw_text: 'went out', polish: true });
        await handler(failed);
        expect(failed.update).not.toHaveBeenCalled();

        h.generateTextWithFallback.mockResolvedValueOnce({ text: '   ' });
        const empty = event({ action: 'Walk', raw_text: 'went out', polish: true });
        await handler(empty);
        expect(empty.update).not.toHaveBeenCalled();
    });
});

describe('buildPolishPrompt', () => {
    it('asks for fixes only, in the person’s voice and language, with the note last', () => {
        const prompt = buildPolishPrompt('Walk', 'went to the rivr');
        expect(prompt).toContain('("Walk")');
        expect(prompt).toContain('Add nothing they did not say');
        expect(prompt.endsWith('NOTE:\nwent to the rivr')).toBe(true);
    });
});
