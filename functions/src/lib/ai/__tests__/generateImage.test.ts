// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('@google/genai', () => ({ GoogleGenAI: vi.fn() }));

import { buildImageRequestParts, type ImageAspectRatio, type ReferenceMode } from '../generateImage.js';

const PROMPT = 'A person walking on a beach.';
const ref = Buffer.from('fake-jpeg');

function textOf(parts: ReturnType<typeof buildImageRequestParts>): string | undefined {
    return parts[parts.length - 1].text;
}

describe('buildImageRequestParts: reference images', () => {
    it('without references returns only the text part with no prefix', () => {
        const parts = buildImageRequestParts({ prompt: PROMPT, aspectRatio: '1:1' });
        expect(parts).toEqual([{ text: PROMPT }]);
    });

    it('puts reference images first as base64 jpeg inlineData, text last', () => {
        const ref2 = Buffer.from('second');
        const parts = buildImageRequestParts({ prompt: PROMPT, referenceImages: [ref, ref2] });
        expect(parts).toHaveLength(3);
        expect(parts[0]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: ref.toString('base64') } });
        expect(parts[1].inlineData.data).toBe(ref2.toString('base64'));
        expect(parts[2]).toHaveProperty('text');
    });

    it("defaults to 'full' mode: anchors build and style", () => {
        const text = textOf(buildImageRequestParts({ prompt: PROMPT, referenceImages: [ref], aspectRatio: '1:1' }));
        expect(text).toMatch(/face, build, hair, and personal style/);
        expect(text.endsWith(PROMPT)).toBe(true);
    });

    it("'face-only' mode anchors the face and tells the model not to copy the body", () => {
        const text = textOf(buildImageRequestParts({ prompt: PROMPT, referenceImages: [ref], referenceMode: 'face-only', aspectRatio: '1:1' }));
        expect(text).toMatch(/ONLY to maintain the character's face/);
        expect(text).toMatch(/Do NOT copy the body type/);
        expect(text).not.toMatch(/personal style/);
    });

    it("an unknown mode falls back to 'full'", () => {
        const full = textOf(buildImageRequestParts({ prompt: PROMPT, referenceImages: [ref], referenceMode: 'full' }));
        const unknown = textOf(buildImageRequestParts({ prompt: PROMPT, referenceImages: [ref], referenceMode: 'weird' as ReferenceMode }));
        expect(unknown).toBe(full);
        expect(unknown).not.toMatch(/undefined/);
    });

    it('ignores the mode when there are no reference images', () => {
        const text = textOf(buildImageRequestParts({ prompt: PROMPT, referenceMode: 'face-only', aspectRatio: '1:1' }));
        expect(text).toBe(PROMPT);
    });
});

describe('buildImageRequestParts: aspect ratio hints', () => {
    it("defaults to '16:9' landscape", () => {
        const text = textOf(buildImageRequestParts({ prompt: PROMPT }));
        expect(text).toBe(PROMPT + ' 16:9 landscape orientation. Do not generate in portrait or square format.');
    });

    it("'1:1' adds no hint", () => {
        expect(textOf(buildImageRequestParts({ prompt: PROMPT, aspectRatio: '1:1' }))).toBe(PROMPT);
    });

    it.each<[ImageAspectRatio, RegExp]>([
        ['9:16', /9:16 portrait orientation \(1080×1920\)/],
        ['16:9', /16:9 landscape orientation/],
        ['4:3', /4:3 landscape orientation/],
        ['3:4', /3:4 portrait orientation/],
        ['4:5', /4:5 portrait orientation \(1080×1350\)/],
    ])('%s appends its orientation hint after the prompt', (aspectRatio, hint) => {
        const text = textOf(buildImageRequestParts({ prompt: PROMPT, aspectRatio }));
        expect(text.startsWith(PROMPT + ' ')).toBe(true);
        expect(text).toMatch(hint);
    });

    it('an unknown aspect ratio adds no hint', () => {
        const text = textOf(buildImageRequestParts({ prompt: PROMPT, aspectRatio: '2:1' as ImageAspectRatio }));
        expect(text).toBe(PROMPT);
    });
});
