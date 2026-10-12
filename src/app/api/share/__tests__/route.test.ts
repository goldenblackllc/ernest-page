// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, makeRequest, TEST_UID, VALID_TOKEN } from "@/test/fakeFirestore";
import { POST, DELETE } from "../route";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakeFirestore")).firestoreModuleMock());
vi.mock("firebase-admin/auth", async () => (await import("@/test/fakeFirestore")).authModuleMock());

const URL = "http://localhost/api/share";

describe("/api/share", () => {
    beforeEach(() => {
        fakeDb.reset();
        fakeDb.seed("posts/mine", { uid: TEST_UID, visibility: "private" });
        fakeDb.seed("posts/shared", { uid: TEST_UID, visibility: "private", shareToken: "existing-token" });
        fakeDb.seed("posts/theirs", { uid: "someone-else", shareToken: "their-token" });
    });

    it("POST makes a 128-bit URL-safe token", async () => {
        const res = await POST(makeRequest(URL, { token: VALID_TOKEN, body: { postId: "mine" } }));
        expect(res.status).toBe(200);
        const { shareToken } = await res.json();
        expect(shareToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(fakeDb.writes).toEqual([{ op: "update", path: "posts/mine", data: { shareToken } }]);
    });

    it("POST reuses an existing token", async () => {
        const res = await POST(makeRequest(URL, { token: VALID_TOKEN, body: { postId: "shared" } }));
        expect((await res.json()).shareToken).toBe("existing-token");
        expect(fakeDb.writes).toEqual([]);
    });

    it("DELETE removes the author's token", async () => {
        const res = await DELETE(makeRequest(URL, { method: "DELETE", token: VALID_TOKEN, body: { postId: "shared" } }));
        expect(res.status).toBe(200);
        expect(fakeDb.writes).toEqual([{ op: "update", path: "posts/shared", data: { shareToken: { __op: "delete" } } }]);
    });

    it("DELETE on an unshared post changes nothing", async () => {
        const res = await DELETE(makeRequest(URL, { method: "DELETE", token: VALID_TOKEN, body: { postId: "mine" } }));
        expect(res.status).toBe(200);
        expect(fakeDb.writes).toEqual([]);
    });

    it("DELETE refuses someone else's post", async () => {
        const res = await DELETE(makeRequest(URL, { method: "DELETE", token: VALID_TOKEN, body: { postId: "theirs" } }));
        expect(res.status).toBe(403);
        expect(fakeDb.writes).toEqual([]);
    });

    it("DELETE returns 404 for a missing post and 400 without a postId", async () => {
        expect((await DELETE(makeRequest(URL, { method: "DELETE", token: VALID_TOKEN, body: { postId: "nope" } }))).status).toBe(404);
        expect((await DELETE(makeRequest(URL, { method: "DELETE", token: VALID_TOKEN, body: {} }))).status).toBe(400);
    });
});
