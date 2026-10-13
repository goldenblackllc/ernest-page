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
    const res = await GET(makeRequest("http://localhost/api/posts/feed?page=0", { method: "GET", token: VALID_TOKEN }));
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
});
