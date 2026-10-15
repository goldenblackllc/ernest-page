// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { currentSituation, localDayHour, type CharacterStyle } from '../situations.js';

const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
const STYLE: CharacterStyle = {
    situations: [
        { id: 'study', label: 'In the study', portrait: 'p' },
        { id: 'office', label: 'At the office', portrait: 'p' },
        { id: 'bed', label: 'In bed, reading', portrait: 'p' },
        { id: 'garden', label: 'In the garden', portrait: 'p' },
    ],
    week: [
        { days: [...weekdays], from: 7, situation: 'study' },
        { days: [...weekdays], from: 9, situation: 'office' },
        { days: [...weekdays], from: 22, situation: 'bed' },
        { days: ['sat'], from: 10, situation: 'garden' },
    ],
};

describe('currentSituation', () => {
    it('picks the latest block that has started today', () => {
        expect(currentSituation(STYLE, 2, 14)?.id).toBe('office');  // Tuesday 2 p.m.
        expect(currentSituation(STYLE, 2, 7)?.id).toBe('study');
        expect(currentSituation(STYLE, 2, 23)?.id).toBe('bed');
    });

    it("carries the previous night's block past midnight", () => {
        expect(currentSituation(STYLE, 3, 2)?.id).toBe('bed');      // Wednesday 2 a.m.
        expect(currentSituation(STYLE, 6, 8)?.id).toBe('bed');      // Saturday 8 a.m., from Friday night
    });

    it('looks back across days with no blocks', () => {
        expect(currentSituation(STYLE, 0, 15)?.id).toBe('garden');  // Sunday, from Saturday 10 a.m.
    });

    it('falls back to the main portrait situation, and to nothing without situations', () => {
        expect(currentSituation({ ...STYLE, week: [] }, 2, 14)?.id).toBe('study');
        expect(currentSituation(undefined, 2, 14)).toBeUndefined();
    });
});

describe('localDayHour', () => {
    it('reads the day and hour in the given time zone', () => {
        const date = new Date('2026-10-14T03:30:00Z');              // a Wednesday in UTC
        expect(localDayHour(date, 'UTC')).toEqual({ day: 3, hour: 3 });
        expect(localDayHour(date, 'America/Denver')).toEqual({ day: 2, hour: 21 });
    });
});
