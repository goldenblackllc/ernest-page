// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getBibleText } from '../bible.js';

describe('getBibleText', () => {
    it('returns an empty string when the user doc is missing', () => {
        expect(getBibleText(undefined)).toBe('');
    });
    it('returns an empty string when there is no bible text', () => {
        expect(getBibleText({ bible: { sections: [{ heading: 'A', content: 'a' }] } })).toBe('');
    });
    it('returns bible.text', () => {
        expect(getBibleText({ bible: { text: '## Style & Presence\n\nCalm.' } })).toBe('## Style & Presence\n\nCalm.');
    });
});
