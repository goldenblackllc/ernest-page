// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "@/test/fakeFirestore";
import { GET } from "../route";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());

const SECRET = "SECRET-PRIVATE-VALUE";
const TOKEN = "abc123def456";

function get(token: string) {
    return GET(new Request(`http://localhost/api/share/${token}`), { params: Promise.resolve({ token }) });
}

describe("GET /api/share/[token]", () => {
    beforeEach(() => {
        fakeDb.reset();
        // A private post its author shared: the token is the permission.
        fakeDb.seed("posts/p1", {
            uid: "author-uid",
            authorId: "author-uid",
            shareToken: TOKEN,
            is_public: false,
            visibility: "private",
            content_raw: `transcript ${SECRET}`,
            conversation_messages: [{ role: "user", content: SECRET }],
            counsel: SECRET,
            region: SECRET,
            lat: 1.5,
            lng: 2.5,
            geohash: SECRET,
            authorHash: SECRET,
            translations: { es: { letter: SECRET } },
            title: "Shared title",
        });
    });

    it("serves the shared post with no private fields, token or author id", async () => {
        const res = await get(TOKEN);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.post.id).toBe("p1");
        expect(body.post.title).toBe("Shared title");
        const json = JSON.stringify(body);
        expect(json).not.toContain(SECRET);
        expect(json).not.toContain(TOKEN);
        expect(json).not.toContain("author-uid");
        for (const key of ["is_public", "visibility", "shareToken", "uid", "authorId"]) {
            expect(body.post).not.toHaveProperty(key);
        }
    });

    it("returns 404 for an unknown token", async () => {
        const res = await get("zzzzzzzzzzzz");
        expect(res.status).toBe(404);
    });

    it.each(["", "short"])("rejects a too-short token %j with 400", async (token) => {
        const res = await get(token);
        expect(res.status).toBe(400);
    });

    it("returns a generic 500 without leaking the error", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        fakeDb.failWith = new Error(`db exploded ${SECRET}`);
        const res = await get(TOKEN);
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain(SECRET);
    });
});
