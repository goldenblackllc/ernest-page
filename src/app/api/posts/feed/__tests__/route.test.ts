// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, makeRequest, TEST_UID, VALID_TOKEN } from "@/test/fakeFirestore";
import { GET } from "../route";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakeFirestore")).firestoreModuleMock());
vi.mock("firebase-admin/auth", async () => (await import("@/test/fakeFirestore")).authModuleMock());

const created_at = { toDate: () => new Date("2026-10-13T00:39:27Z"), toMillis: () => Date.parse("2026-10-13T00:39:27Z") };

// A post created private: text and thumbnail only, no images or audio until shared.
const privatePost = (uid: string) => ({
    uid, authorId: uid, visibility: "private", is_public: false, media_status: "deferred",
    images_complete: true, image_prompts: [], message_images: [], imagen_urls: [], imagen_url: null,
    thumbnail_url: "https://storage.googleapis.com/b/post-thumbnails/p.jpg",
    content_raw: "user: hello", title: "I had a good day", created_at,
});

async function feedIds() {
    const res = await GET(makeRequest("http://localhost/api/posts/feed", { method: "GET", token: VALID_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json();
    return (body.posts as { id: string }[]).map((p) => p.id);
}

describe("GET /api/posts/feed", () => {
    beforeEach(() => {
        fakeDb.reset();
        fakeDb.seed(`users/${TEST_UID}`, {});
    });

    it("shows the author their own private post, which has only a thumbnail", async () => {
        fakeDb.seed("posts/mine", privatePost(TEST_UID));
        expect(await feedIds()).toContain("mine");
    });

    it("never shows someone else's private post", async () => {
        fakeDb.seed("posts/theirs", privatePost("someone-else"));
        expect(await feedIds()).not.toContain("theirs");
    });

    it("sends only the fields a card shows, without word timestamps or prompts", async () => {
        fakeDb.seed("posts/pub", {
            uid: "someone-else", authorId: "someone-else", is_public: true, visibility: "public",
            title: "A public post", letter: "Dear Earnest", response: "Hello", created_at,
            audio_url: "https://storage.googleapis.com/b/audio/p.mp3",
            audio_word_timestamps: [{ word: "Dear", start: 0, end: 0.3 }],
            short_audio_word_timestamps: [{ word: "Dear", start: 0, end: 0.3 }],
            image_prompts: ["a long prompt"],
        });
        const res = await GET(makeRequest("http://localhost/api/posts/feed", { method: "GET", token: VALID_TOKEN }));
        const post = (await res.json()).posts.find((p: { id: string }) => p.id === "pub");
        expect(post).toMatchObject({ title: "A public post", letter: "Dear Earnest", audio_url: expect.any(String) });
        expect(post).not.toHaveProperty("audio_word_timestamps");
        expect(post).not.toHaveProperty("short_audio_word_timestamps");
        expect(post).not.toHaveProperty("image_prompts");
    });

    it("returns the newest posts first and continues from an offset", async () => {
        for (let i = 1; i <= 7; i++) {
            const at = Date.parse(`2026-10-0${i}T00:00:00Z`);
            fakeDb.seed(`posts/p${i}`, {
                uid: "someone-else", authorId: "someone-else", is_public: true, title: `Post ${i}`,
                created_at: { toDate: () => new Date(at), toMillis: () => at },
                audio_url: "https://storage.googleapis.com/b/audio/p.mp3",
            });
        }
        const read = async (query: string) => {
            const res = await GET(makeRequest(`http://localhost/api/posts/feed?${query}`, { method: "GET", token: VALID_TOKEN }));
            const body = await res.json();
            return { ids: (body.posts as { id: string }[]).map((p) => p.id), hasMore: body.hasMore };
        };
        expect(await read("limit=5")).toEqual({ ids: ["p7", "p6", "p5", "p4", "p3"], hasMore: true });
        expect(await read("offset=5&limit=20")).toEqual({ ids: ["p2", "p1"], hasMore: false });
    });

    it("adds the author's avatar and title and whether the user liked the post", async () => {
        fakeDb.seed("users/someone-else", { avatar: { url: "https://a/avatar.jpg" }, identity: { title: "The Gardener" } });
        fakeDb.seed(`users/${TEST_UID}/liked_posts/pub`, {});
        fakeDb.seed("posts/pub", {
            uid: "someone-else", authorId: "someone-else", is_public: true, visibility: "public",
            title: "A public post", created_at, audio_url: "https://storage.googleapis.com/b/audio/p.mp3",
        });
        const res = await GET(makeRequest("http://localhost/api/posts/feed", { method: "GET", token: VALID_TOKEN }));
        const post = (await res.json()).posts.find((p: { id: string }) => p.id === "pub");
        expect(post).toMatchObject({
            author_avatar_url: "https://a/avatar.jpg", author_title: "The Gardener", isLikedByMe: true,
        });
    });
});
