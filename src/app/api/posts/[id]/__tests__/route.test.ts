// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "@/test/fakeFirestore";
import { GET } from "../route";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());

const SECRET = "SECRET-PRIVATE-VALUE";

function get(id: string) {
    return GET(new Request(`http://localhost/api/posts/${id}`), { params: Promise.resolve({ id }) });
}

function seedPost(id: string, extra: Record<string, unknown>) {
    fakeDb.seed(`posts/${id}`, {
        uid: "author-uid",
        content_raw: `transcript ${SECRET}`,
        conversation_messages: [{ role: "user", content: SECRET }],
        region: SECRET,
        lat: 1.5,
        lng: 2.5,
        geohash: SECRET,
        authorHash: SECRET,
        title: "Public title",
        ...extra,
    });
}

describe("GET /api/posts/[id]", () => {
    beforeEach(() => fakeDb.reset());

    it("serves a public post without private fields", async () => {
        seedPost("p1", { is_public: true, visibility: "public" });
        const res = await get("p1");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.post.title).toBe("Public title");
        expect(JSON.stringify(body)).not.toContain(SECRET);
        expect(body.post).not.toHaveProperty("uid");
        expect(body.post).not.toHaveProperty("content_raw");
        expect(body.post).not.toHaveProperty("lat");
    });

    it.each([
        ["is_public false", { is_public: false, visibility: "public" }],
        ["visibility private", { is_public: false, visibility: "private" }],
        ["is_public missing", { visibility: "community" }],
        ["is_public truthy but not true", { is_public: "true" }],
    ])("returns 404 for a non-public post (%s)", async (_label, extra) => {
        seedPost("p1", extra);
        const res = await get("p1");
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body).toEqual({ error: "Post not found" });
    });

    it("returns 404 for a missing post", async () => {
        const res = await get("nope");
        expect(res.status).toBe(404);
    });

    it("returns a generic 500 without leaking the error", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        fakeDb.failWith = new Error(`db exploded ${SECRET}`);
        const res = await get("p1");
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body).toEqual({ error: expect.any(String) });
        expect(JSON.stringify(body)).not.toContain(SECRET);
    });
});
