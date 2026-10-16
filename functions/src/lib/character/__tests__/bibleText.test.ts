// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { joinBibleSections, splitBibleText, splitSubsections } from '../bibleText.js';

describe('splitBibleText', () => {
    it('splits on "## " lines and drops the preamble', () => {
        expect(splitBibleText('Intro\n\n## Style & Presence\n\n**Suits:** Navy.\n\n## Something Else\nMore.')).toEqual([
            { heading: 'Style & Presence', content: '**Suits:** Navy.' },
            { heading: 'Something Else', content: 'More.' },
        ]);
    });

    it('names loosely written headings exactly', () => {
        expect(splitBibleText('## 3. **People and Connections**\nA.\n## the world i love\nB.').map(s => s.heading))
            .toEqual(['People & Connections', 'The World I Love']);
    });

    it('ignores "###" lines and returns nothing for an empty document', () => {
        expect(splitBibleText('## The Inner Mind\n### Calm\nA.')).toEqual([{ heading: 'The Inner Mind', content: '### Calm\nA.' }]);
        expect(splitBibleText('')).toEqual([]);
    });

    it('round-trips with joinBibleSections', () => {
        const sections = [{ heading: 'Style & Presence', content: 'A.' }, { heading: 'The Inner Mind', content: 'B.' }];
        expect(splitBibleText(joinBibleSections(sections))).toEqual(sections);
    });
});

describe('splitSubsections', () => {
    it('accepts the colon inside or outside the bold, and skips plain bold', () => {
        expect(splitSubsections('**Morning:** Coffee at **Blue Bottle**.\n\n**Evening**: Reading.')).toEqual([
            { title: 'Morning', content: 'Coffee at **Blue Bottle**.' },
            { title: 'Evening', content: 'Reading.' },
        ]);
    });
});
