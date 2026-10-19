// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, makeRequest, TEST_UID, VALID_TOKEN } from "@/test/fakeFirestore";
import { GET } from "../route";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakeFirestore")).firestoreModuleMock());
vi.mock("firebase-admin/auth", async () => (await import("@/test/fakeFirestore")).authModuleMock());

const words = [{ word: "Hola", start: 0, end: 0.4 }];

function get(id?: string) {
    const url = id ? `http://localhost/api/posts/timestamps?id=${id}` : "http://localhost/api/posts/timestamps";
    return GET(makeRequest(url, { method: "GET", token: VALID_TOKEN }));
}

describe("GET /api/posts/timestamps", () => {
    beforeEach(() => fakeDb.reset());

    it("serves a public post's word timestamps", async () => {
        fakeDb.seed("posts/p1", { authorId: "someone-else", is_public: true, audio_word_timestamps: words });
        const res = await get("p1");
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ audio_word_timestamps: words, short_audio_word_timestamps: null });
    });

    it("serves the author's own unpublished post", async () => {
        fakeDb.seed("posts/p1", { authorId: TEST_UID, is_public: false, short_audio_word_timestamps: words });
        const res = await get("p1");
        expect(res.status).toBe(200);
        expect((await res.json()).short_audio_word_timestamps).toEqual(words);
    });

    it("hides someone else's unpublished post", async () => {
        fakeDb.seed("posts/p1", { authorId: "someone-else", is_public: false, audio_word_timestamps: words });
        const res = await get("p1");
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: "Post not found" });
    });

    it("returns 404 for a missing post and 400 without an id", async () => {
        expect((await get("nope")).status).toBe(404);
        expect((await get()).status).toBe(400);
    });
});
