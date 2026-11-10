// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, makeRequest, VALID_TOKEN, TEST_UID } from "@/test/fakeFirestore";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakeFirestore")).firestoreModuleMock());
vi.mock("firebase-admin/auth", async () => (await import("@/test/fakeFirestore")).authModuleMock());
const deriveIdentityTitle = vi.hoisted(() => vi.fn());
vi.mock("@functions/lib/ai/identity", () => ({ deriveIdentityTitle }));
vi.mock("@functions/lib/ai/models", () => ({ generateWithFallback: vi.fn() }));

import { POST } from "../identity/route";

const USER = `users/${TEST_UID}`;
const save = (text: unknown) => POST(makeRequest("http://localhost/api/identity", { token: VALID_TOKEN, body: { text } }));
const written = () => fakeDb.writes.map(w => w.data as Record<string, unknown>);

beforeEach(() => {
    fakeDb.reset();
    deriveIdentityTitle.mockReset();
    deriveIdentityTitle.mockResolvedValue("Calm, Generous");
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeDb.seed(USER, { identity: { text: "I am a gentleman.", title: "Gentleman" } });
});

describe("/api/identity", () => {
    it("saves who they are with a new title, and rebuilds the Bible from it", async () => {
        const res = await save("  I am calm and generous.  ");
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ identity: { text: "I am calm and generous.", title: "Calm, Generous" } });
        expect(deriveIdentityTitle).toHaveBeenCalledWith("I am calm and generous.", expect.any(Function));
        expect(written()).toEqual([{
            identity: { text: "I am calm and generous.", title: "Calm, Generous" },
            bible_dirty_since: { __op: "serverTimestamp" },
        }]);
    });

    it("keeps the old title when a new one can't be made", async () => {
        deriveIdentityTitle.mockRejectedValue(new Error("model down"));
        await save("I am calm.");
        expect(written()[0].identity).toEqual({ text: "I am calm.", title: "Gentleman" });
    });

    it("does nothing when the text is the same", async () => {
        const res = await save("I am a gentleman. ");
        expect(await res.json()).toEqual({ identity: { text: "I am a gentleman.", title: "Gentleman" } });
        expect(deriveIdentityTitle).not.toHaveBeenCalled();
        expect(fakeDb.writes).toEqual([]);
    });

    it("clears it when the text is emptied", async () => {
        const res = await save("   ");
        expect(await res.json()).toEqual({ identity: null });
        expect(written()[0].identity).toEqual({ __op: "delete" });
        expect(deriveIdentityTitle).not.toHaveBeenCalled();
    });

    it("returns 400 for missing or too long text, without writing", async () => {
        expect((await save(undefined)).status).toBe(400);
        expect((await save("I am ".repeat(100))).status).toBe(400);
        expect(fakeDb.writes).toEqual([]);
    });
});
