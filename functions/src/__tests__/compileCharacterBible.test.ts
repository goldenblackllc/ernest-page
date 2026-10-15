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

import { compileCharacterBibleForUser, cleanStyle } from '../compileCharacterBible.js';

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

const brief = (outfit: string) => `${outfit}, neatly trimmed beard, relaxed upright posture, warm half smile, looking into the camera.`;
type Days = ('sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat')[];
const weekdays: Days = ['mon', 'tue', 'wed', 'thu', 'fri'];
const WEEK = {
    places: [
        { id: 'Study', label: 'In the study' },
        { id: 'office', label: 'At the office' },
        { id: 'bed', label: 'In bed, reading' },
    ],
    week: [
        { days: weekdays, from: 7, place: 'study' },
        { days: weekdays, from: 9, place: 'office' },
        { days: [...weekdays, 'sat', 'sun'] as Days, from: 22, place: 'bed' },
    ],
};
const LOOKS = {
    looks: [
        { place: 'study', portrait: brief('A charcoal three-piece suit with a navy silk tie') },
        { place: 'office', portrait: brief('A navy Kiton suit, white shirt and burgundy tie') },
        { place: 'bed', portrait: brief('Striped cotton pajamas under a wool robe') },
    ],
    main: 'office',
};

/** Phase 1, the bible, the week and the looks, in call order. */
function mockModel(bible: Record<string, unknown>, week: unknown = WEEK, looks: unknown = LOOKS) {
    h.generateWithFallback
        .mockResolvedValueOnce({ object: PHASE1 })
        .mockResolvedValueOnce({
            object: bible,
            finishReason: 'stop',
            usage: { outputTokens: 7000 },
            response: { modelId: 'opus' },
        })
        .mockResolvedValueOnce({ object: week })
        .mockResolvedValueOnce({ object: looks });
}

describe('compileCharacterBibleForUser', () => {
    beforeEach(() => {
        h.generateWithFallback.mockReset();
        h.userSet.mockClear();
    });

    it('saves the bible, the week and the looks, main portrait first', async () => {
        mockModel(BIBLE);
        const result = await compileCharacterBibleForUser('u1');
        expect(result.success).toBe(true);
        expect(h.userSet).toHaveBeenCalledOnce();
        expect(h.userSet.mock.calls[0][0].bible.sections).toHaveLength(7);
        const style = h.userSet.mock.calls[0][0].bible.style;
        expect(style.situations.map((x: { id: string }) => x.id)).toEqual(['office', 'study', 'bed']);
        expect(style.week).toHaveLength(3);
    });

    it('gives the week and looks calls the finished bible', async () => {
        mockModel({ ...BIBLE, Style_and_Presence: 'A Barbour Bedale for the school run. '.repeat(20) });
        await compileCharacterBibleForUser('u1');
        const [, , weekCall, looksCall] = h.generateWithFallback.mock.calls.map(c => c[0].prompt as string);
        expect(weekCall).toContain('## Style & Presence\nA Barbour Bedale');
        expect(looksCall).toContain('A Barbour Bedale');
        expect(looksCall).toContain('office: At the office');
    });

    it('throws and keeps the old bible when too few places have a usable look', async () => {
        mockModel(BIBLE, WEEK, { ...LOOKS, looks: [LOOKS.looks[0], { place: 'office', portrait: 'A suit.' }] });
        await expect(compileCharacterBibleForUser('u1')).rejects.toThrow(/usable situations/);
        expect(h.userSet).not.toHaveBeenCalled();
    });

    it('throws and keeps the old bible when the model leaves sections empty', async () => {
        mockModel({ ...BIBLE, People_and_Connections: '', The_Inner_Mind: '', The_World_I_Love: 'a' });
        await expect(compileCharacterBibleForUser('u1')).rejects.toThrow(
            /People_and_Connections, The_Inner_Mind, The_World_I_Love/,
        );
        expect(h.userSet).not.toHaveBeenCalled();
    });
});

describe('cleanStyle', () => {
    it('slugs ids and drops duplicates, places without a usable look and blocks that point nowhere', () => {
        const style = cleanStyle(
            {
                places: [...WEEK.places, { id: 'Office', label: 'Again' }, { id: 'yard', label: 'In the yard' }],
                week: [
                    ...WEEK.week,
                    { days: ['mon'], from: 6, place: 'yard' },
                    { days: ['mon'], from: 25, place: 'office' },
                    { days: ['someday' as 'mon'], from: 8, place: 'office' },
                ],
            },
            { looks: [...LOOKS.looks, { place: 'yard', portrait: 'Jeans.' }], main: 'missing' },
        );
        expect(style.situations.map(x => x.id)).toEqual(['study', 'office', 'bed']);
        expect(style.week).toEqual(WEEK.week.map(b => ({ days: b.days, from: b.from, situation: b.place })));
    });

    it('throws without a usable week', () => {
        expect(() => cleanStyle({ ...WEEK, week: [] }, LOOKS)).toThrow(/week/);
    });
});
