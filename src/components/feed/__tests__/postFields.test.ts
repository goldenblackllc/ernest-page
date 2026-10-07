// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { Post } from "@/types/post";
import { getPostAudio, getLetterRatio, getPostImages } from "../postFields";

function post(fields: Partial<Post> = {}): Post {
    return { id: "p", created_at: null, ...fields };
}

const words = (n: string) => [{ word: n, start: 0, end: 1 }];

describe("getPostAudio", () => {
    it("prefers the short clip for ordinary posts", () => {
        const audio = getPostAudio(post({
            short_audio_url: "short.mp3", audio_url: "full.mp3",
            short_audio_word_timestamps: words("short"), audio_word_timestamps: words("full"),
        }));
        expect(audio.unifiedAudioUrl).toBe("short.mp3");
        expect(audio.wordTimestamps).toEqual(words("short"));
        expect(audio.hasAudio).toBe(true);
    });

    it("prefers the conversation audio for condensed-transcript posts", () => {
        const audio = getPostAudio(post({
            public_post: { condensed_transcript: [{ role: "user", text: "hi" }] },
            short_audio_url: "short.mp3", audio_url: "full.mp3",
            short_audio_word_timestamps: words("short"), audio_word_timestamps: words("full"),
        }));
        expect(audio.unifiedAudioUrl).toBe("full.mp3");
        expect(audio.wordTimestamps).toEqual(words("full"));
    });

    it("falls back to whichever audio exists", () => {
        expect(getPostAudio(post({ audio_url: "full.mp3" })).unifiedAudioUrl).toBe("full.mp3");
        expect(getPostAudio(post({
            public_post: { condensed_transcript: [{ role: "user", text: "hi" }] }, short_audio_url: "short.mp3",
        })).unifiedAudioUrl).toBe("short.mp3");
    });

    it("treats an empty condensed transcript as an ordinary post", () => {
        const audio = getPostAudio(post({ public_post: { condensed_transcript: [] }, short_audio_url: "s", audio_url: "f" }));
        expect(audio.unifiedAudioUrl).toBe("s");
    });

    it("counts the legacy two-file format only when both files exist", () => {
        expect(getPostAudio(post({ letter_audio_url: "l", response_audio_url: "r" })).hasAudio).toBe(true);
        expect(getPostAudio(post({ letter_audio_url: "l" })).hasAudio).toBe(false);
    });

    it("reports no audio for a bare post", () => {
        expect(getPostAudio(post())).toEqual({ unifiedAudioUrl: undefined, wordTimestamps: undefined, hasAudio: false });
    });
});

describe("getLetterRatio", () => {
    it("uses the stored short-clip ratio first, including 0", () => {
        expect(getLetterRatio(post({ short_audio_letter_ratio: 0, audio_letter_ratio: 0.7 }), "a b", "c")).toBe(0);
    });

    it("falls back to the stored audio ratio", () => {
        expect(getLetterRatio(post({ audio_letter_ratio: 0.7 }), "a b", "c")).toBe(0.7);
    });

    it("estimates from word counts when nothing is stored", () => {
        expect(getLetterRatio(post(), "one two three", "four")).toBe(0.75);
    });

    it("ignores extra whitespace when counting words", () => {
        expect(getLetterRatio(post(), "  one   two ", "three  four ")).toBe(0.5);
    });

    it("returns 0.5 for empty text", () => {
        expect(getLetterRatio(post(), "", "")).toBe(0.5);
    });
});

describe("getPostImages", () => {
    it("uses one image per message for per-message posts", () => {
        const images = getPostImages(post({ image_style: "per-message", message_images: ["m1", "m2"], user_photo_url: "u" }));
        expect(images.isPerMessage).toBe(true);
        expect(images.imageUrls).toEqual(["m1", "m2"]);
    });

    it("is not per-message while message images are still empty", () => {
        const images = getPostImages(post({ image_style: "per-message", message_images: [], imagen_url: "ai" }));
        expect(images.isPerMessage).toBe(false);
        expect(images.imageUrls).toEqual(["ai"]);
    });

    it("puts the user photo before the AI images", () => {
        const images = getPostImages(post({ user_photo_url: "u", imagen_urls: ["a1", "a2"] }));
        expect(images.imageUrls).toEqual(["u", "a1", "a2"]);
        expect(images.heroUrl).toBe("u");
    });

    it("picks the hero in order thumbnail, user photo, public_post image, imagen_url", () => {
        expect(getPostImages(post({ thumbnail_url: "t", user_photo_url: "u", imagen_url: "i" })).heroUrl).toBe("t");
        expect(getPostImages(post({ public_post: { imagen_url: "pp" }, imagen_url: "i" })).heroUrl).toBe("pp");
        expect(getPostImages(post({ imagen_url: "i" })).heroUrl).toBe("i");
    });

    it("reports no image for a post whose images are not generated yet", () => {
        const images = getPostImages(post({ imagen_urls: [], message_images: [] }));
        expect(images).toEqual({ heroUrl: undefined, imageUrls: [], isPerMessage: false, hasImage: false });
    });
});
