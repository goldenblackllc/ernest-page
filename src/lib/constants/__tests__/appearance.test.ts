// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
    optionKey,
    SKIN_TONE_OPTIONS,
    HAIR_COLOR_OPTIONS,
    HAIR_TEXTURE_OPTIONS,
    HAIR_VOLUME_OPTIONS,
    EYE_COLOR_OPTIONS,
} from "../appearance";

describe("optionKey", () => {
    it.each([
        ["Brown", "Brown"],
        ["Dark Brown", "DarkBrown"],
        ["Bald/Shaved", "BaldShaved"],
        [`5'10"`, ""],
        ["", ""],
        ["  Light  Brown ", "LightBrown"],
    ])("%j -> %j", (input, expected) => {
        expect(optionKey(input)).toBe(expected);
    });

    it("gives every appearance option a distinct, non-empty key within its list", () => {
        for (const list of [SKIN_TONE_OPTIONS, HAIR_COLOR_OPTIONS, HAIR_TEXTURE_OPTIONS, HAIR_VOLUME_OPTIONS, EYE_COLOR_OPTIONS]) {
            const keys = list.map(optionKey);
            expect(keys.every(Boolean)).toBe(true);
            expect(new Set(keys).size).toBe(keys.length);
        }
    });
});
