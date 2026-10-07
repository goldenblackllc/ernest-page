// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "@/test/fakeFirestore";
import { serializePublicPost } from "../serializePublicPost";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());

const SECRET = "SECRET-PRIVATE-VALUE";

/** A post document as processChat writes it, plus legacy and server-only fields. */
function privatePostDoc(): Record<string, unknown> {
    return {
        id: "p1",
        uid: "author-uid",
        authorId: "author-uid",
        authorHash: `hash-${SECRET}`,
        author: `Author title ${SECRET}`,
        region: `region-${SECRET}`,
        lat: 40.7128,
        lng: -74.006,
        geohash: `dr5r-${SECRET}`,
        content_raw: `User: my real transcript ${SECRET}`,
        conversation_messages: [{ role: "user", content: `private chat ${SECRET}` }],
        counsel: `private counsel ${SECRET}`,
        rant: `private rant ${SECRET}`,
        letter: `legacy top-level letter ${SECRET}`,
        response: `legacy top-level response ${SECRET}`,
        condensed_editorial_note: `editor note ${SECRET}`,
        image_prompts: [`prompt ${SECRET}`],
        imagen_prompt: `prompt ${SECRET}`,
        imagen_prompts: [`prompt ${SECRET}`],
        visual_style: `style-${SECRET}`,
        translations: { es: { letter: `translated ${SECRET}` } },
        shareToken: `token-${SECRET}`,
        phone: `+1555${SECRET}`,
        phone_hash: `phonehash-${SECRET}`,
        status: "completed",
        is_public: true,
        visibility: "public",
        images_complete: true,
        // Public fields
        title: "A public title",
        public_post: { condensed_transcript: [{ role: "user", text: "public text" }] },
        message_images: ["https://img/1.png"],
        image_style: "per-message",
        audio_url: "https://audio/1.mp3",
        like_count: 3,
        comments: 2,
        language: "en",
        created_at: { _seconds: 1700000000, _nanoseconds: 5, toDate: () => new Date() },
    };
}

const PRIVATE_KEYS = [
    "uid", "authorId", "authorHash", "author", "region", "lat", "lng", "geohash",
    "content_raw", "conversation_messages", "counsel", "rant", "letter", "response",
    "condensed_editorial_note", "image_prompts", "imagen_prompt", "imagen_prompts",
    "visual_style", "translations", "shareToken", "phone", "phone_hash",
    "status", "is_public", "visibility",
];

describe("serializePublicPost", () => {
    beforeEach(() => {
        fakeDb.reset();
        fakeDb.seed("users/author-uid", {
            avatar: { url: "https://avatar/a.png" },
            identity: { title: "The Builder" },
            phone: `+1555${SECRET}`,
            email: `me-${SECRET}@example.com`,
            dossier: `dossier ${SECRET}`,
            character_bible: { secret: SECRET },
        });
    });

    it.each(PRIVATE_KEYS)("never outputs the private field %s", async (key) => {
        const post = await serializePublicPost("p1", privatePostDoc());
        expect(post).not.toHaveProperty(key);
    });

    it("leaks no private value anywhere in the serialized JSON", async () => {
        const post = await serializePublicPost("p1", privatePostDoc());
        const json = JSON.stringify(post);
        expect(json).not.toContain(SECRET);
        expect(json).not.toContain("author-uid");
        expect(json).not.toContain("40.7128");
    });

    it("keeps the public fields", async () => {
        const post = await serializePublicPost("p1", privatePostDoc());
        expect(post).toMatchObject({
            id: "p1",
            title: "A public title",
            public_post: { condensed_transcript: [{ role: "user", text: "public text" }] },
            message_images: ["https://img/1.png"],
            audio_url: "https://audio/1.mp3",
            like_count: 3,
            comments: 2,
        });
    });

    it("attaches only the author's avatar and title from the user doc", async () => {
        const post = await serializePublicPost("p1", privatePostDoc());
        expect(post.author_avatar_url).toBe("https://avatar/a.png");
        expect(post.author_title).toBe("The Builder");
    });

    it("reduces created_at to plain seconds and nanoseconds", async () => {
        const post = await serializePublicPost("p1", privatePostDoc());
        expect(post.created_at).toEqual({ _seconds: 1700000000, _nanoseconds: 5 });
    });

    it("returns null created_at when it is missing", async () => {
        const doc = privatePostDoc();
        delete doc.created_at;
        const post = await serializePublicPost("p1", doc);
        expect(post.created_at).toBeNull();
    });

    it("handles a minimal doc with no author", async () => {
        const post = await serializePublicPost("p2", {});
        expect(post.id).toBe("p2");
        expect(post.public_post).toEqual({});
        expect(post.like_count).toBe(0);
        expect(post.author_avatar_url).toBeNull();
        expect(post.author_title).toBeNull();
    });

    it("still serializes when the author lookup fails", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        fakeDb.failWith = new Error("firestore down");
        const post = await serializePublicPost("p1", privatePostDoc());
        expect(post.author_title).toBeNull();
        expect(JSON.stringify(post)).not.toContain(SECRET);
    });
});
