// @vitest-environment node
// Cross-route API conventions: auth (401), generic 500s and rate limits (429).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb, makeRequest, VALID_TOKEN, TEST_UID } from "@/test/fakeFirestore";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakeFirestore")).firestoreModuleMock());
vi.mock("firebase-admin/auth", async () => (await import("@/test/fakeFirestore")).authModuleMock());
vi.mock("@functions/lib/ai/models", () => ({
    OPUS_MODEL: "test-model",
    OPUS_FALLBACK: "test-fallback",
    generateWithFallback: vi.fn(async () => {
        throw new Error("AI must not be called in tests");
    }),
    generateTextWithFallback: vi.fn(async () => {
        throw new Error("AI must not be called in tests");
    }),
}));

type Handler = (req: Request, ctx?: unknown) => Promise<Response>;

// Every route that requires a signed-in user. (support and voice/search call
// verifyAuth too, but auth is optional there: anonymous users are rate-limited by IP.)
const AUTH_ROUTES: [string, string, () => Promise<Record<string, unknown>>][] = [
    ["account/delete", "DELETE", () => import("../account/delete/route")],
    ["account/export", "POST", () => import("../account/export/route")],
    ["check-session-access", "POST", () => import("../check-session-access/route")],
    ["consume-session", "POST", () => import("../consume-session/route")],
    ["onboarding/process", "POST", () => import("../onboarding/process/route")],
    ["posts/comment", "POST", () => import("../posts/comment/route")],
    ["posts/comment/delete", "POST", () => import("../posts/comment/delete/route")],
    ["posts/comments", "GET", () => import("../posts/comments/route")],
    ["posts/feed", "GET", () => import("../posts/feed/route")],
    ["posts/like", "POST", () => import("../posts/like/route")],
    ["posts/mine", "GET", () => import("../posts/mine/route")],
    ["posts/saved", "GET", () => import("../posts/saved/route")],
    ["share", "POST", () => import("../share/route")],
    ["tts", "POST", () => import("../tts/route")],
    ["voice/select", "POST", () => import("../voice/select/route")],
];

const BAD_AUTH: [string, Record<string, string>][] = [
    ["no Authorization header", {}],
    ["a non-Bearer header", { Authorization: `Basic ${VALID_TOKEN}` }],
    ["an invalid token", { Authorization: "Bearer not-a-real-token" }],
];

async function loadHandler(load: () => Promise<Record<string, unknown>>, method: string) {
    const mod = await load();
    const handler = mod[method] as Handler | undefined;
    if (!handler) throw new Error(`route does not export ${method}`);
    return handler;
}

function body(res: Response) {
    return res.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
    fakeDb.reset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => {
        throw new Error("network must not be used in tests");
    }));
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("routes that require auth", () => {
    describe.each(AUTH_ROUTES)("%s (%s)", (path, method, load) => {
        it.each(BAD_AUTH)("returns 401 with %s", async (_label, headers) => {
            const handler = await loadHandler(load, method);
            const req = new Request(`http://localhost/api/${path}?postId=p1`, {
                method,
                headers: { "Content-Type": "application/json", ...headers },
                body: method === "GET" ? undefined : JSON.stringify({ postId: "p1" }),
            });
            const res = await handler(req);
            expect(res.status).toBe(401);
            expect(await body(res)).toEqual({ error: "Unauthorized" });
            expect(fakeDb.writes).toEqual([]);
        });
    });
});

describe("internal errors", () => {
    const SECRET = "internal-detail-SECRET";

    const SAMPLES: [string, string, () => Promise<Record<string, unknown>>, unknown][] = [
        ["check-session-access", "POST", () => import("../check-session-access/route"), {}],
        ["posts/comments?postId=p1", "GET", () => import("../posts/comments/route"), undefined],
        ["posts/like", "POST", () => import("../posts/like/route"), { postId: "p1" }],
        ["posts/comment", "POST", () => import("../posts/comment/route"), { postId: "p1", comment: "hi" }],
        ["voice/select", "POST", () => import("../voice/select/route"), { voiceId: "voice-id-1234567", voiceName: "V" }],
        ["account/export", "POST", () => import("../account/export/route"), {}],
    ];

    it.each(SAMPLES)("%s returns a generic 500 that hides the thrown message", async (path, method, load, reqBody) => {
        const handler = await loadHandler(load, method);
        fakeDb.failWith = new Error(SECRET);
        const res = await handler(makeRequest(`http://localhost/api/${path}`, { method, token: VALID_TOKEN, body: reqBody }));
        expect(res.status).toBe(500);
        const json = await body(res);
        expect(Object.keys(json)).toEqual(["error"]);
        expect(typeof json.error).toBe("string");
        expect(JSON.stringify(json)).not.toContain(SECRET);
    });
});

describe("rate limits", () => {
    // The limiter's store is module state, so each test re-imports the routes after
    // resetModules to get a fresh limiter. (Mocked modules, and so fakeDb, are kept.)
    beforeEach(() => {
        vi.resetModules();
        fakeDb.seed(`users/${TEST_UID}`, { identity: { title: "Tester" } });
    });

    async function hit(handler: Handler, path: string, reqBody: unknown, times: number) {
        const statuses: number[] = [];
        for (let i = 0; i < times; i++) {
            const res = await handler(makeRequest(`http://localhost/api/${path}`, { token: VALID_TOKEN, body: reqBody }));
            statuses.push(res.status);
        }
        return statuses;
    }

    it("posts/like allows 30 likes per minute, then returns 429", async () => {
        const { POST } = await import("../posts/like/route");
        const statuses = await hit(POST, "posts/like", { postId: "p1" }, 31);
        expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
        expect(statuses[30]).toBe(429);
    });

    it("posts/comment allows 10 comments per minute, then returns 429", async () => {
        const { POST } = await import("../posts/comment/route");
        const statuses = await hit(POST, "posts/comment", { postId: "p1", comment: "hello" }, 11);
        expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
        expect(statuses[10]).toBe(429);
        expect(fakeDb.writes.filter((w) => w.op === "add")).toHaveLength(10);
    });

    it("a 429 carries Retry-After and a JSON error", async () => {
        const { POST } = await import("../posts/comment/route");
        await hit(POST, "posts/comment", { postId: "p1", comment: "hello" }, 10);
        const res = await POST(makeRequest("http://localhost/api/posts/comment", { token: VALID_TOKEN, body: { postId: "p1", comment: "x" } }));
        expect(res.status).toBe(429);
        expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
        expect(await body(res)).toMatchObject({ error: expect.any(String) });
    });

    it("the limit starts fresh after modules are reset", async () => {
        const { POST } = await import("../posts/comment/route");
        const statuses = await hit(POST, "posts/comment", { postId: "p1", comment: "hello" }, 1);
        expect(statuses).toEqual([200]);
    });
});
