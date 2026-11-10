// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb, makeRequest, VALID_TOKEN, TEST_UID } from "@/test/fakeFirestore";
import type { Action } from "@functions/lib/actions";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakeFirestore")).firestoreModuleMock());
vi.mock("firebase-admin/auth", async () => (await import("@/test/fakeFirestore")).authModuleMock());

import { PATCH, DELETE } from "../actions/route";

const USER = `users/${TEST_UID}`;
// 11pm in New York on Oct 25 is already Oct 26 in UTC: ticks count for the person's own day
const NOW = Date.UTC(2026, 9, 26, 3);
const TODAY = "2026-10-25";
const call = (handler: (req: Request) => Promise<Response>, method: string, body: unknown) =>
    handler(makeRequest("http://localhost/api/actions", { method, token: VALID_TOKEN, body }));
const stored = () => fakeDb.docs.get(USER)?.actions as Action[];
const score = () => fakeDb.docs.get(USER)?.action_score;
const tick = (id: string, done: boolean) => call(PATCH, "PATCH", { id, done, timeZone: "America/New_York" });

beforeEach(() => {
    fakeDb.reset();
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeDb.seed(USER, {
        action_score: 4,
        actions: [
            { id: "a", text: "Call Dad", kind: "once", decided_on: "2026-10-20" },
            { id: "b", text: "Run by breath", kind: "daily", decided_on: "2026-10-22", done_on: TODAY },
        ],
    });
});

afterEach(() => {
    vi.useRealTimers();
});

describe("/api/actions", () => {
    it("ticks an action for the person's local day and adds a point", async () => {
        const res = await tick("a", true);
        expect(res.status).toBe(200);
        expect(stored()[0]).toEqual({ id: "a", text: "Call Dad", kind: "once", decided_on: "2026-10-20", done_on: TODAY });
        expect(score()).toBe(5);
    });

    it("doesn't write or score a tick that is already there", async () => {
        expect((await tick("b", true)).status).toBe(200);
        expect(fakeDb.writes).toEqual([]);
        expect(score()).toBe(4);
    });

    it("unticks today's tick and takes its point back", async () => {
        await tick("b", false);
        expect(stored()[1]).toEqual({ id: "b", text: "Run by breath", kind: "daily", decided_on: "2026-10-22" });
        expect(score()).toBe(3);
    });

    it("counts a tick on a new day again", async () => {
        vi.setSystemTime(NOW + 86_400_000);
        await tick("b", true);
        expect(stored()[1].done_on).toBe("2026-10-26");
        expect(score()).toBe(5);
    });

    it("deletes an action and keeps the points it earned", async () => {
        const res = await call(DELETE, "DELETE", { id: "b" });
        expect(res.status).toBe(200);
        expect(stored().map(c => c.id)).toEqual(["a"]);
        expect(score()).toBe(4);
    });

    it("returns 404 for an action that doesn't exist, without writing", async () => {
        expect((await tick("zz", true)).status).toBe(404);
        expect((await call(DELETE, "DELETE", { id: "zz" })).status).toBe(404);
        expect(fakeDb.writes).toEqual([]);
    });

    it("returns 400 for a malformed body", async () => {
        expect((await call(PATCH, "PATCH", { id: "a" })).status).toBe(400);
        expect((await call(DELETE, "DELETE", {})).status).toBe(400);
    });
});
