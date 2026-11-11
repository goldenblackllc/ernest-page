// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    cleanOptions, cleanText, commitment, remainingOptions, shownMinutes, shownText,
    MAX_OPTIONS, MAX_OPTION_LENGTH, MAX_TEXT_LENGTH, MAX_SHOWN_MINUTES,
} from '../now.js';

describe('cleanOptions', () => {
    it('keeps the options as typed, without blanks, repeats or extra spaces', () => {
        expect(cleanOptions(['  Walk ', '', 'Answer   emails', 'walk', 42, 'Clean the kitchen'])).toEqual(
            ['Walk', 'Answer emails', 'Clean the kitchen'],
        );
    });

    it('keeps at most MAX_OPTIONS, each at most MAX_OPTION_LENGTH long', () => {
        const many = Array.from({ length: MAX_OPTIONS + 3 }, (_, i) => `Option ${i}`);
        expect(cleanOptions(many)).toHaveLength(MAX_OPTIONS);
        expect(cleanOptions(['x'.repeat(MAX_OPTION_LENGTH + 20)])[0]).toHaveLength(MAX_OPTION_LENGTH);
    });

    it('returns nothing for anything but a list', () => {
        expect(cleanOptions('Walk')).toEqual([]);
        expect(cleanOptions(undefined)).toEqual([]);
    });
});

describe('commitment', () => {
    it('commits to the picked option, as written on the list', () => {
        expect(commitment(['Walk', 'Answer emails'], ' walk ')).toEqual({ action: 'Walk', options: ['Walk', 'Answer emails'] });
    });

    it('refuses a pick that is not on the list', () => {
        expect(commitment(['Walk'], 'Run')).toBeNull();
        expect(commitment(['Walk'], '')).toBeNull();
        expect(commitment([], 'Walk')).toBeNull();
        expect(commitment(['Walk'], 7)).toBeNull();
    });
});

describe('remainingOptions', () => {
    it('brings back every option but the one just done', () => {
        expect(remainingOptions(['Walk', 'Answer emails', 'Clean the kitchen'], 'walk')).toEqual(['Answer emails', 'Clean the kitchen']);
    });
});

describe('cleanText', () => {
    it('trims, keeps line breaks and cuts to MAX_TEXT_LENGTH', () => {
        expect(cleanText('  Went to the river.\n\nCame back lighter.  ')).toBe('Went to the river.\n\nCame back lighter.');
        expect(cleanText('x'.repeat(MAX_TEXT_LENGTH + 5))).toHaveLength(MAX_TEXT_LENGTH);
        expect(cleanText(null)).toBe('');
    });

    it('turns the \\r\\n line breaks of form data into plain newlines', () => {
        expect(cleanText('Went to the river.\r\n\r\nCame back lighter.\rSlept.')).toBe('Went to the river.\n\nCame back lighter.\nSlept.');
    });
});

describe('shownMinutes', () => {
    const start = Date.UTC(2026, 10, 10, 15, 40);

    it('counts the minutes from Commit to Done, at least one', () => {
        expect(shownMinutes(start, start + 25 * 60_000)).toBe(25);
        expect(shownMinutes(start, start + 10_000)).toBe(1);
    });

    it('leaves the time off past MAX_SHOWN_MINUTES, the sign of a forgotten Finish', () => {
        expect(shownMinutes(start, start + MAX_SHOWN_MINUTES * 60_000)).toBe(MAX_SHOWN_MINUTES);
        expect(shownMinutes(start, start + (MAX_SHOWN_MINUTES + 1) * 60_000)).toBeNull();
    });

    it('leaves the time off when a time is missing', () => {
        expect(shownMinutes(NaN, start)).toBeNull();
    });
});

describe('shownText', () => {
    it('shows the polished words unless the person switched back to their own', () => {
        expect(shownText({ raw_text: 'went to the rivr', polished_text: 'Went to the river.' })).toBe('Went to the river.');
        expect(shownText({ raw_text: 'went to the rivr', polished_text: 'Went to the river.', show_raw: true })).toBe('went to the rivr');
        expect(shownText({ raw_text: 'went to the rivr', polished_text: null })).toBe('went to the rivr');
    });
});
