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
    const generateTextWithFallback = vi.fn();
    return { userSet, userData, db, generateWithFallback, generateTextWithFallback };
});

vi.mock('firebase-functions/v2/https', () => ({ onRequest: (_opts: unknown, handler: unknown) => handler }));
vi.mock('../lib/firebase/admin.js', () => ({ db: h.db, FieldValue: { delete: () => 'DELETE' } }));
vi.mock('../characterBuild.js', () => ({ enqueueBuildCharacter: vi.fn() }));
vi.mock('../lib/ai/models.js', () => ({
    generateWithFallback: h.generateWithFallback,
    generateTextWithFallback: h.generateTextWithFallback,
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

const full = `**First:** ${'x'.repeat(1000)}\n\n**Second:** ${'y'.repeat(1000)}`;
const HEADINGS = ['Style & Presence', 'Daily Life & Habits', 'People & Connections', 'The Inner Mind', 'Quirks & Details', 'Order & Sanctuary', 'The World I Love'];
/** A bible document; `overrides` replaces a section's content, or drops it when null. */
const bible = (overrides: Record<string, string | null> = {}) => HEADINGS
    .filter(h => overrides[h] !== null)
    .map(h => `## ${h}\n\n${overrides[h] ?? full}`)
    .join('\n\n');

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
    look: 'I keep a short side-parted cut and a close beard, and always wear my Reverso.',
    looks: [
        { place: 'study', portrait: brief('A charcoal three-piece suit with a navy silk tie') },
        { place: 'office', portrait: brief('A navy Kiton suit, white shirt and burgundy tie') },
        { place: 'bed', portrait: brief('Striped cotton pajamas under a wool robe') },
    ],
    main: 'office',
};

/** Phase 1, the week and the looks (objects, in call order), and the bible (text). */
function mockModel(bibleText: string, week: unknown = WEEK, looks: unknown = LOOKS) {
    h.generateWithFallback
        .mockResolvedValueOnce({ object: PHASE1 })
        .mockResolvedValueOnce({ object: week })
        .mockResolvedValueOnce({ object: looks });
    h.generateTextWithFallback.mockResolvedValueOnce({
        text: bibleText,
        finishReason: 'stop',
        usage: { outputTokens: 7000 },
        response: { modelId: 'opus' },
    });
}

describe('compileCharacterBibleForUser', () => {
    beforeEach(() => {
        h.generateWithFallback.mockReset();
        h.generateTextWithFallback.mockReset();
        h.userSet.mockClear();
    });

    it('saves the bible, the week and the looks, main portrait first', async () => {
        mockModel(bible());
        const result = await compileCharacterBibleForUser('u1');
        expect(result.success).toBe(true);
        expect(h.userSet).toHaveBeenCalledOnce();
        expect(h.userSet.mock.calls[0][0].bible.text).toBe(bible());
        expect(h.userSet.mock.calls[0][0].bible.sections).toBe('DELETE');
        const style = h.userSet.mock.calls[0][0].bible.style;
        expect(style.situations.map((x: { id: string }) => x.id)).toEqual(['office', 'study', 'bed']);
        expect(style.week).toHaveLength(3);
        expect(style.look).toBe(LOOKS.look);
    });

    it('gives the week and looks calls the finished bible', async () => {
        mockModel(bible({ 'Style & Presence': 'A Barbour Bedale for the school run. '.repeat(20) }));
        await compileCharacterBibleForUser('u1');
        const [, weekCall, looksCall] = h.generateWithFallback.mock.calls.map(c => c[0].prompt as string);
        expect(weekCall).toContain('## Style & Presence\n\nA Barbour Bedale');
        expect(weekCall).toContain('Write in English.');
        expect(looksCall).toContain('40 to 100 words, in English.');
        expect(looksCall).not.toContain('{LANGUAGE}');
        expect(looksCall).toContain('A Barbour Bedale');
        expect(looksCall).toContain('office: At the office');
    });

    it('throws and keeps the old bible when too few places have a usable look', async () => {
        mockModel(bible(), WEEK, { ...LOOKS, looks: [LOOKS.looks[0], { place: 'office', portrait: 'A suit.' }] });
        await expect(compileCharacterBibleForUser('u1')).rejects.toThrow(/usable situations/);
        expect(h.userSet).not.toHaveBeenCalled();
    });

    it('throws and keeps the old bible when the model leaves sections empty or out', async () => {
        mockModel(bible({ 'People & Connections': null, 'The Inner Mind': '', 'The World I Love': 'a' }));
        await expect(compileCharacterBibleForUser('u1')).rejects.toThrow(
            /People & Connections, The Inner Mind, The World I Love/,
        );
        expect(h.userSet).not.toHaveBeenCalled();
    });

    it('stores loosely written headings by their exact names, in order, without a preamble', async () => {
        const loose = bible()
            .replace('## Style & Presence', 'Here is the bible.\n\n## 1. **Style and Presence**')
            .replace('## The Inner Mind', '## the inner mind');
        mockModel(loose);
        await compileCharacterBibleForUser('u1');
        expect(h.userSet.mock.calls[0][0].bible.text).toBe(bible());
    });

    it('asks for a non-English bible with English headings', async () => {
        h.userData.preferred_locale = 'es';
        try {
            mockModel(bible());
            await compileCharacterBibleForUser('u1');
        } finally {
            delete h.userData.preferred_locale;
        }
        expect(h.generateTextWithFallback.mock.calls[0][0].prompt).toContain(
            'Write the ENTIRE character bible in Spanish. Keep the "## " section headings exactly as written above, in English',
        );
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

    it('leaves out an empty standing look', () => {
        expect(cleanStyle(WEEK, { ...LOOKS, look: '  ' })).not.toHaveProperty('look');
    });
});
