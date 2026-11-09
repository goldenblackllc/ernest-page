// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb, makeRequest, VALID_TOKEN, TEST_UID } from "@/test/fakeFirestore";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakeFirestore")).firestoreModuleMock());
vi.mock("firebase-admin/auth", async () => (await import("@/test/fakeFirestore")).authModuleMock());
const identityFromWords = vi.hoisted(() => vi.fn());
vi.mock("@functions/lib/ai/identity", () => ({ identityFromWords }));
vi.mock("@functions/lib/ai/models", () => ({ generateWithFallback: vi.fn() }));

import { POST } from "../onboarding/process/route";

const USER = `users/${TEST_UID}`;
const onboard = (body: unknown) => POST(makeRequest("http://localhost/api/onboarding/process", { token: VALID_TOKEN, body }));
const setWrites = () => fakeDb.writes.filter(w => w.op === "set").map(w => w.data as Record<string, unknown>);
const compile = vi.fn(async () => new Response("{}", { status: 200 }));

beforeEach(() => {
    fakeDb.reset();
    identityFromWords.mockReset();
    identityFromWords.mockResolvedValue({ text: "I am a gentleman and a father.", title: "Gentleman, Father" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    compile.mockClear();
    vi.stubGlobal("fetch", compile);
    fakeDb.seed(USER, {});
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("/api/onboarding/process", () => {
    it("writes who they are from their words before building the Bible", async () => {
        const res = await onboard({ defining_words: [" Gentleman ", "Father", "", 7] });
        expect(res.status).toBe(200);
        expect(identityFromWords).toHaveBeenCalledWith(["Gentleman", "Father"], expect.any(Function));
        expect(setWrites()[0]).toMatchObject({ identity: { text: "I am a gentleman and a father.", title: "Gentleman, Father" } });
        expect(compile).toHaveBeenCalledTimes(1);
    });

    it("falls back to the words themselves when the sentence can't be written", async () => {
        identityFromWords.mockRejectedValue(new Error("model down"));
        await onboard({ defining_words: ["Gentleman", "Father"] });
        expect(setWrites()[0]).toMatchObject({ identity: { text: "Gentleman, Father", title: "Gentleman, Father" } });
        expect(compile).toHaveBeenCalledTimes(1);
    });

    it("keeps an identity they already have", async () => {
        fakeDb.seed(USER, { dossier: "DOSSIER", identity: { text: "I am calm.", title: "Calm" } });
        await onboard({ defining_words: ["Gentleman"] });
        expect(identityFromWords).not.toHaveBeenCalled();
        expect(setWrites()).toEqual([]);
        expect(compile).toHaveBeenCalledTimes(1);
    });
});
