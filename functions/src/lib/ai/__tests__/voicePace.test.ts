// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../firebase/storage.js', () => ({ uploadPublicFile: vi.fn() }));

import { voicePaceScore } from '../postTTS.js';

describe('voicePaceScore', () => {
    it('prefers brisk descriptive labels', () => {
        expect(voicePaceScore({ name: 'Jessica', descriptive: 'crisp' })).toBe(1);
        expect(voicePaceScore({ name: 'Maya', descriptive: 'Upbeat' })).toBe(1);
    });

    it('reads pace words in the name', () => {
        expect(voicePaceScore({ name: 'Heather Rey - Rushed and Friendly', descriptive: 'casual' })).toBe(1);
        expect(voicePaceScore({ name: 'Lauren - Friendly, Comforting and Soft', descriptive: 'pleasant' })).toBe(-1);
    });

    it('ranks slow voices last, even when also brisk-sounding', () => {
        expect(voicePaceScore({ name: 'Zuri - Casual, Calm and Clear', descriptive: 'calm' })).toBe(-1);
        expect(voicePaceScore({ name: 'Upbeat but Calm', descriptive: 'upbeat' })).toBe(-1);
    });

    it('is neutral without a pace hint', () => {
        expect(voicePaceScore({ name: 'Eryn - Friendly, Wholesome and Rich', descriptive: 'casual' })).toBe(0);
        expect(voicePaceScore({})).toBe(0);
    });

    it('matches whole words only', () => {
        expect(voicePaceScore({ name: 'Breakfast Club' })).toBe(0);
    });
});
