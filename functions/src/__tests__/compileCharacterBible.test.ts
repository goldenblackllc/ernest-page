// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
    const userSet = vi.fn().mockResolvedValue(undefined);
    const userData: Record<string, unknown> = {
        name: 'Arthur',
        defining_words: ['Gentleman'],
        voice: { id: 'voice-1', name: 'Voice', confirmed: true },
    };
    const db = {
        collection: () => ({
            doc: () => ({
                get: async () => ({ exists: true, data: () => userData }),
                set: userSet,
            }),
        }),
    };
    const generateWithFallback = vi.fn();
    return { userSet, db, generateWithFallback };
});

vi.mock('firebase-functions/v2/https', () => ({ onRequest: (_opts: unknown, handler: unknown) => handler }));
vi.mock('../lib/firebase/admin.js', () => ({ db: h.db }));
vi.mock('../characterBuild.js', () => ({ enqueueBuildCharacter: vi.fn() }));
vi.mock('../lib/ai/models.js', () => ({
    generateWithFallback: h.generateWithFallback,
    OPUS_MODEL: 'opus',
    SONNET_MODEL: 'sonnet',
}));

import { compileCharacterBibleForUser } from '../compileCharacterBible.js';

const PHASE1 = {
    living_situation: 'I live in Provence.',
    financial_reality: 'I am comfortable.',
    physical_profile: 'I am six-one.',
    character_facts: 'I am retired.',
    people: [],
};

const full = 'x'.repeat(2000);
const BIBLE = {
    Style_and_Presence: full,
    Daily_Life_and_Habits: full,
    People_and_Connections: full,
    The_Inner_Mind: full,
    Quirks_and_Details: full,
    Order_and_Sanctuary: full,
    The_World_I_Love: full,
};

function mockModel(bible: Record<string, string>) {
    h.generateWithFallback
        .mockResolvedValueOnce({ object: PHASE1 })
        .mockResolvedValueOnce({ object: bible });
}

describe('compileCharacterBibleForUser', () => {
    beforeEach(() => {
        h.generateWithFallback.mockReset();
        h.userSet.mockClear();
    });

    it('saves a bible when every section is written', async () => {
        mockModel(BIBLE);
        const result = await compileCharacterBibleForUser('u1');
        expect(result.success).toBe(true);
        expect(h.userSet).toHaveBeenCalledOnce();
        expect(h.userSet.mock.calls[0][0].bible.sections).toHaveLength(7);
    });

    it('throws and keeps the old bible when the model leaves sections empty', async () => {
        mockModel({ ...BIBLE, People_and_Connections: '', The_Inner_Mind: '', The_World_I_Love: 'a' });
        await expect(compileCharacterBibleForUser('u1')).rejects.toThrow(
            /People_and_Connections, The_Inner_Mind, The_World_I_Love/,
        );
        expect(h.userSet).not.toHaveBeenCalled();
    });
});
