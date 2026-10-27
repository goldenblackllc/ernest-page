// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb, makeRequest, VALID_TOKEN, TEST_UID } from "@/test/fakeFirestore";
import type { Choice } from "@functions/lib/choices";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakeFirestore")).firestoreModuleMock());
vi.mock("firebase-admin/auth", async () => (await import("@/test/fakeFirestore")).authModuleMock());

import { PATCH, DELETE } from "../choices/route";

const USER = `users/${TEST_UID}`;
const call = (handler: (req: Request) => Promise<Response>, method: string, body: unknown) =>
    handler(makeRequest("http://localhost/api/choices", { method, token: VALID_TOKEN, body }));
const stored = () => fakeDb.docs.get(USER)?.choices as Choice[];

beforeEach(() => {
    fakeDb.reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeDb.seed(USER, {
        choices: [
            { id: "a", text: "Call Dad", chosen_on: "2026-10-20" },
            { id: "b", text: "Run by breath", chosen_on: "2026-10-22", done_at: 5 },
        ],
    });
});

describe("/api/choices", () => {
    it("ticks a choice", async () => {
        const res = await call(PATCH, "PATCH", { id: "a", done: true });
        expect(res.status).toBe(200);
        expect(stored()[0]).toEqual({ id: "a", text: "Call Dad", chosen_on: "2026-10-20", done_at: expect.any(Number) });
    });

    it("keeps the first tick time when ticked again", async () => {
        await call(PATCH, "PATCH", { id: "b", done: true });
        expect(stored()[1].done_at).toBe(5);
    });

    it("unticks a choice", async () => {
        await call(PATCH, "PATCH", { id: "b", done: false });
        expect(stored()[1]).toEqual({ id: "b", text: "Run by breath", chosen_on: "2026-10-22" });
    });

    it("deletes a choice", async () => {
        const res = await call(DELETE, "DELETE", { id: "a" });
        expect(res.status).toBe(200);
        expect(stored().map(c => c.id)).toEqual(["b"]);
    });

    it("returns 404 for a choice that doesn't exist, without writing", async () => {
        expect((await call(PATCH, "PATCH", { id: "zz", done: true })).status).toBe(404);
        expect((await call(DELETE, "DELETE", { id: "zz" })).status).toBe(404);
        expect(fakeDb.writes).toEqual([]);
    });

    it("returns 400 for a malformed body", async () => {
        expect((await call(PATCH, "PATCH", { id: "a" })).status).toBe(400);
        expect((await call(DELETE, "DELETE", {})).status).toBe(400);
    });
});
