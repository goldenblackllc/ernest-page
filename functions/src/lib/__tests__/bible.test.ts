// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getCompiledBible } from '../bible.js';

describe('getCompiledBible', () => {
    it('returns [] when the user doc is missing', () => {
        expect(getCompiledBible(undefined)).toEqual([]);
    });
    it('returns [] when neither bible field exists', () => {
        expect(getCompiledBible({ name: 'x' })).toEqual([]);
    });
    it('returns [] when bible exists without sections', () => {
        expect(getCompiledBible({ bible: {} })).toEqual([]);
    });
    it('returns bible.sections', () => {
        const sections = [{ title: 'A', content: 'a' }];
        expect(getCompiledBible({ bible: { sections } })).toEqual(sections);
    });
    it('falls back to the legacy compiled_output.ideal', () => {
        const ideal = [{ title: 'L', content: 'l' }];
        expect(getCompiledBible({ character_bible: { compiled_output: { ideal } } })).toEqual(ideal);
    });
    it('prefers bible.sections over the legacy field', () => {
        const sections = [{ title: 'new' }];
        const ideal = [{ title: 'old' }];
        expect(getCompiledBible({ bible: { sections }, character_bible: { compiled_output: { ideal } } })).toEqual(sections);
    });
});
