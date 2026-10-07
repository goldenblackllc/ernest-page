// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { WordTimestamp } from "@/types/post";
import { buildSubtitleTrack, getCurrentSubtitle } from "../subtitles";

/** Word timestamps one second apart: word i spans [i, i + 0.9]. */
function timed(text: string): WordTimestamp[] {
    return text.split(" ").map((word, i) => ({ word, start: i, end: i + 0.9 }));
}

const idle = { audioPhase: "idle" as const, isPlaying: false, audioCurrentTime: 0, audioProgress: 0, isUnified: true, letterRatio: 0.5 };

describe("buildSubtitleTrack: text chunks", () => {
    it("returns a single empty chunk for empty text", () => {
        const track = buildSubtitleTrack("", "   ", undefined, 0.5);
        expect(track.letterChunks).toEqual([""]);
        expect(track.responseChunks).toEqual([""]);
    });

    it("keeps short sentences together up to about 12 words", () => {
        const track = buildSubtitleTrack("One two three. Four five six. Seven eight nine ten eleven twelve thirteen.", "", undefined, 0.5);
        expect(track.letterChunks).toEqual(["One two three. Four five six.", "Seven eight nine ten eleven twelve thirteen."]);
    });

    it("never splits inside a sentence, even a long one", () => {
        const long = "a b c d e f g h i j k l m n o p.";
        expect(buildSubtitleTrack(long, "", undefined, 0.5).letterChunks).toEqual([long]);
    });

    it("keeps trailing text that has no final punctuation", () => {
        const track = buildSubtitleTrack("First sentence here. and then trailing words", "", undefined, 0.5);
        expect(track.letterChunks.join(" ")).toBe("First sentence here. and then trailing words");
    });

    it("handles text with no sentence punctuation at all", () => {
        expect(buildSubtitleTrack("no punctuation here", "", undefined, 0.5).letterChunks).toEqual(["no punctuation here"]);
    });

    it("strips real newlines and literal \\n artifacts", () => {
        const track = buildSubtitleTrack("Line one.\n\nLine two.\\nLine three.", "", undefined, 0.5);
        expect(track.letterChunks).toEqual(["Line one. Line two. Line three."]);
    });

    it("drops a leading THE COUNSEL: label from the response", () => {
        const track = buildSubtitleTrack("Hi.", "THE COUNSEL: Be brave.", undefined, 0.5);
        expect(track.responseChunks).toEqual(["Be brave."]);
        expect(track.allChunks).toEqual(["Hi.", "Be brave."]);
    });
});

describe("buildSubtitleTrack: timestamp chunks", () => {
    it.each([
        ["missing", undefined],
        ["empty", []],
        ["only ellipsis tokens", [{ word: "...", start: 0, end: 1 }, { word: "…", start: 1, end: 2 }]],
    ])("is null when timestamps are %s", (_label, ts) => {
        expect(buildSubtitleTrack("a", "b", ts, 0.5).timestampChunks).toBeNull();
    });

    it("breaks at sentence ends once a chunk has 3 words", () => {
        const chunks = buildSubtitleTrack("", "", timed("No. I feel lost. Help me now."), 0)!.timestampChunks!;
        expect(chunks.map((c) => c.text)).toEqual(["No. I feel lost.", "Help me now."]);
    });

    it("forces a break after 11 words without punctuation", () => {
        const chunks = buildSubtitleTrack("", "", timed("a b c d e f g h i j k l m"), 0)!.timestampChunks!;
        expect(chunks.map((c) => c.words.length)).toEqual([11, 2]);
    });

    it("forces a break at the letter/response boundary", () => {
        const chunks = buildSubtitleTrack("", "", timed("w1 w2 w3 w4 w5 w6"), 0.5)!.timestampChunks!;
        expect(chunks.map((c) => c.text)).toEqual(["w1 w2 w3", "w4 w5 w6"]);
    });

    it("drops ellipsis tokens and carries word timing", () => {
        const ts = [
            { word: "Hello", start: 1, end: 1.5 },
            { word: "...", start: 1.5, end: 2 },
            { word: "there", start: 2, end: 2.5 },
        ];
        const [chunk] = buildSubtitleTrack("", "", ts, 0)!.timestampChunks!;
        expect(chunk).toEqual({
            text: "Hello there",
            start: 1,
            end: 2.5,
            words: [{ word: "Hello", start: 1, end: 1.5 }, { word: "there", start: 2, end: 2.5 }],
        });
    });

    it("puts the greeting and sign-off on their own lines", () => {
        const chunks = buildSubtitleTrack("", "", timed("Dear Sam, you can."), 0)!.timestampChunks!;
        expect(chunks[0].text).toBe("Dear Sam,\nyou can.");
        const signOff = buildSubtitleTrack("", "", timed("Sincerely, Future Sam"), 0)!.timestampChunks!;
        expect(signOff[0].text).toBe("Sincerely,\nFuture Sam");
    });
});

describe("getCurrentSubtitle", () => {
    it("previews the first text chunk while idle", () => {
        const track = buildSubtitleTrack("One two. ", "Three four.", undefined, 0.5);
        expect(getCurrentSubtitle(track, idle)).toEqual({ current: "One two.", next: "Three four.", lineIndex: 0, totalLines: 2 });
    });

    it("previews the first timestamp chunk while idle, with no active word", () => {
        const track = buildSubtitleTrack("x", "y", timed("No. I feel lost. Help me now."), 0);
        expect(getCurrentSubtitle(track, idle)).toMatchObject({ current: "No. I feel lost.", next: "Help me now.", lineIndex: 0, totalLines: 2, activeWordIndex: -1 });
    });

    it("follows the audio clock with timestamps", () => {
        // chunks: "No. I feel lost." (0-3) then "Help me now." (4-6)
        const track = buildSubtitleTrack("x", "y", timed("No. I feel lost. Help me now."), 0);
        const at = (t: number) => getCurrentSubtitle(track, { ...idle, audioPhase: "letter", isPlaying: true, audioCurrentTime: t });
        expect(at(0)).toMatchObject({ current: "No. I feel lost.", lineIndex: 0, activeWordIndex: 0 });
        expect(at(2.5)).toMatchObject({ lineIndex: 0, activeWordIndex: 2 });
        expect(at(5.2)).toMatchObject({ current: "Help me now.", next: "", lineIndex: 1, activeWordIndex: 1 });
        expect(at(999)).toMatchObject({ lineIndex: 1, activeWordIndex: 2 });
    });

    it("estimates the letter line from unified progress without timestamps", () => {
        // letter chunks: 2 lines of 7 and 7 words; letterRatio 0.5
        const letter = "a b c d e f g. h i j k l m n.";
        const track = buildSubtitleTrack(letter, "Response one.", undefined, 0.5);
        const at = (p: number) => getCurrentSubtitle(track, { ...idle, audioPhase: "letter", isPlaying: true, audioProgress: p });
        expect(at(0.1)).toMatchObject({ current: "a b c d e f g.", lineIndex: 0, totalLines: 3 });
        expect(at(0.4)).toMatchObject({ current: "h i j k l m n.", lineIndex: 1 });
    });

    it("offsets response lines by the letter line count", () => {
        const track = buildSubtitleTrack("a b c d e f g. h i j k l m n.", "Response one.", undefined, 0.5);
        const sub = getCurrentSubtitle(track, { ...idle, audioPhase: "response", isPlaying: true, audioProgress: 0.9 });
        expect(sub).toMatchObject({ current: "Response one.", lineIndex: 2, totalLines: 3 });
    });

    it("uses raw progress per phase for separate (non-unified) files", () => {
        const track = buildSubtitleTrack("a b c d e f g. h i j k l m n.", "R.", undefined, 0.5);
        const sub = getCurrentSubtitle(track, { ...idle, audioPhase: "letter", isPlaying: true, isUnified: false, audioProgress: 0.9 });
        expect(sub).toMatchObject({ lineIndex: 1 });
    });

    it("does not divide by zero when the letter ratio is 0", () => {
        const track = buildSubtitleTrack("Only line.", "R.", undefined, 0);
        const sub = getCurrentSubtitle(track, { ...idle, audioPhase: "letter", isPlaying: true, audioProgress: 0.5, letterRatio: 0 });
        expect(sub).toMatchObject({ current: "Only line.", lineIndex: 0 });
    });
});
