// @vitest-environment node
// /api/tts only speaks text the server stored, and only up to a daily budget.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb, makeRequest, VALID_TOKEN, TEST_UID } from "@/test/fakeFirestore";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakeFirestore")).firestoreModuleMock());
vi.mock("firebase-admin/auth", async () => (await import("@/test/fakeFirestore")).authModuleMock());

const ttsFetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

function post(body: unknown) {
    return makeRequest("http://localhost/api/tts", { token: VALID_TOKEN, body });
}

function spokenText() {
    const init = ttsFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    return init ? JSON.parse(String(init.body)).text : undefined;
}

beforeEach(() => {
    fakeDb.reset();
    ttsFetch.mockClear();
    vi.stubGlobal("fetch", ttsFetch);
    vi.stubEnv("ELEVENLABS_API_KEY", "test-elevenlabs-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeDb.seed(`users/${TEST_UID}`, {
        voice: { id: "voice-id-1234567" },
        active_todos: [{ task: "Call your brother." }, { task: "Walk for 20 minutes." }],
    });
    fakeDb.seed(`users/${TEST_UID}/active_chats/s1`, {
        messages: [
            { id: "u1", role: "user", content: "Hello" },
            { id: "a1", role: "assistant", content: "**Good** to see you." },
        ],
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("POST /api/tts", () => {
    it("speaks a stored assistant reply, without markdown", async () => {
        const { POST } = await import("../tts/route");
        const res = await POST(post({ sessionId: "s1", messageId: "a1" }));
        expect(res.status).toBe(200);
        expect(res.headers.get("X-TTS-Parts")).toBe("1");
        expect(spokenText()).toBe("Good to see you.");
        expect(String(ttsFetch.mock.calls[0][0])).toContain("voice-id-1234567");
    });

    it("ignores any text the client sends", async () => {
        const { POST } = await import("../tts/route");
        const res = await POST(post({ sessionId: "s1", messageId: "a1", text: "Read this instead", voiceId: "other-voice-123" }));
        expect(res.status).toBe(200);
        expect(spokenText()).toBe("Good to see you.");
        expect(String(ttsFetch.mock.calls[0][0])).toContain("voice-id-1234567");
    });

    it("refuses user messages and unknown messages", async () => {
        const { POST } = await import("../tts/route");
        expect((await POST(post({ sessionId: "s1", messageId: "u1" }))).status).toBe(404);
        expect((await POST(post({ sessionId: "s1", messageId: "nope" }))).status).toBe(404);
        expect((await POST(post({ sessionId: "other", messageId: "a1" }))).status).toBe(404);
        expect((await POST(post({ text: "free text" }))).status).toBe(400);
        expect(ttsFetch).not.toHaveBeenCalled();
    });

    it("speaks a plan from the saved directives", async () => {
        const { POST } = await import("../tts/route");
        const res = await POST(post({ sessionId: "s1", messageId: "plan-1700000000000" }));
        expect(res.status).toBe(200);
        expect(spokenText()).toBe("Call your brother.. Walk for 20 minutes.");
    });

    it("stops at the daily character budget", async () => {
        const { POST, DAILY_TTS_CHAR_LIMIT } = await import("../tts/route");
        const today = new Date().toISOString().split("T")[0];
        fakeDb.seed(`users/${TEST_UID}`, {
            voice: { id: "voice-id-1234567" },
            access: { voice_usage: { date: today, chars: DAILY_TTS_CHAR_LIMIT - 3 } },
        });
        const res = await POST(post({ sessionId: "s1", messageId: "a1" }));
        expect(res.status).toBe(429);
        expect(ttsFetch).not.toHaveBeenCalled();
    });

    it("counts what it speaks", async () => {
        const { POST } = await import("../tts/route");
        await POST(post({ sessionId: "s1", messageId: "a1" }));
        const write = fakeDb.writes.find((w) => w.op === "set" && w.path === `users/${TEST_UID}`);
        expect(write?.data).toMatchObject({ access: { voice_usage: { chars: "Good to see you.".length } } });
    });
});
