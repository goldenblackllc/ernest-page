// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseBirthDate, computeAge } from '../parseBirthDate.js';

// Local noon avoids any timezone date shift.
function setToday(y: number, m: number, d: number) {
    vi.setSystemTime(new Date(y, m - 1, d, 12, 0, 0));
}

beforeEach(() => {
    vi.useFakeTimers();
    setToday(2026, 6, 15);
});
afterEach(() => {
    vi.useRealTimers();
});

describe('parseBirthDate formats', () => {
    it('parses an ISO date', () => {
        // ISO date-only strings are UTC; compare year only plus month/day range.
        const r = parseBirthDate('2011-04-11T12:00:00');
        expect(r).toEqual({ year: 2011, month: 4, day: 11 });
    });
    it('parses a full text date', () => {
        expect(parseBirthDate('April 11, 2011')).toEqual({ year: 2011, month: 4, day: 11 });
    });
    it('parses US format', () => {
        expect(parseBirthDate('12/18/2007')).toEqual({ year: 2007, month: 12, day: 18 });
    });
    it('parses month and year', () => {
        expect(parseBirthDate('September 2005')).toMatchObject({ year: 2005, month: 9 });
    });
    it('parses a bare year without shifting it', () => {
        expect(parseBirthDate('2005')).toEqual({ year: 2005, month: null, day: null });
    });
    it('parses European dotted format to at least the year', () => {
        expect(parseBirthDate('18.12.2007')?.year).toBe(2007);
    });
    it('extracts the year from text the Date parser rejects', () => {
        expect(parseBirthDate('1990ish')).toEqual({ year: 1990, month: null, day: null });
    });
    it('trims whitespace', () => {
        expect(parseBirthDate('  1999  ')).toEqual({ year: 1999, month: null, day: null });
    });
});

describe('parseBirthDate invalid input', () => {
    it.each([undefined, null, '', '   ', 'not a date', 'banana'])('returns null for %j', (input) => {
        expect(parseBirthDate(input as string | null | undefined)).toBeNull();
    });
    it('rejects years before 1900', () => {
        expect(parseBirthDate('1850')).toBeNull();
    });
    it('rejects future years', () => {
        expect(parseBirthDate('2030')).toBeNull();
    });
});

describe('computeAge', () => {
    it('computes age when the birthday has passed this year', () => {
        expect(computeAge('March 1, 1990')).toBe(36);
    });
    it('computes age when the birthday is later this year', () => {
        expect(computeAge('December 1, 1990')).toBe(35);
    });
    it('counts a birthday today as a full year', () => {
        expect(computeAge('June 15, 1990')).toBe(36);
    });
    it('is one less the day before the birthday', () => {
        expect(computeAge('June 16, 1990')).toBe(35);
    });
    it('uses month only when day is unknown (same month counts as passed)', () => {
        expect(computeAge('June 1990')).toBe(36);
        expect(computeAge('July 1990')).toBe(35);
    });
    it('uses year only when that is all there is', () => {
        expect(computeAge('1990')).toBe(36);
    });
    it('leap-day birthday: not yet a year older on Feb 28 of a non-leap year', () => {
        setToday(2027, 2, 28);
        expect(computeAge('February 29, 2000')).toBe(26);
    });
    it('leap-day birthday: a year older on Mar 1 of a non-leap year', () => {
        setToday(2027, 3, 1);
        expect(computeAge('February 29, 2000')).toBe(27);
    });
    it('leap-day birthday: a year older on Feb 29 of a leap year', () => {
        setToday(2028, 2, 29);
        expect(computeAge('February 29, 2000')).toBe(28);
    });
    it('returns null for ages under 13', () => {
        expect(computeAge('2020')).toBeNull();
    });
    it('returns 13 exactly at the threshold', () => {
        expect(computeAge('June 15, 2013')).toBe(13);
    });
    it('returns null for unparseable input', () => {
        expect(computeAge('garbage')).toBeNull();
        expect(computeAge(undefined)).toBeNull();
    });
});
