// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type RateLimitModule = typeof import("../rateLimit");
let checkRateLimit: RateLimitModule["checkRateLimit"];
let rateLimitResponse: RateLimitModule["rateLimitResponse"];

const LIMIT = { maxRequests: 3, windowMs: 60_000 };

beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.resetModules(); // fresh in-memory store per test
    ({ checkRateLimit, rateLimitResponse } = await import("../rateLimit"));
});

afterEach(() => {
    vi.useRealTimers();
});

describe("checkRateLimit", () => {
    it("allows requests up to the limit and counts down remaining", () => {
        expect(checkRateLimit("u", LIMIT)).toMatchObject({ allowed: true, remaining: 2 });
        expect(checkRateLimit("u", LIMIT)).toMatchObject({ allowed: true, remaining: 1 });
        expect(checkRateLimit("u", LIMIT)).toMatchObject({ allowed: true, remaining: 0 });
    });

    it("blocks the request past the limit", () => {
        for (let i = 0; i < 3; i++) checkRateLimit("u", LIMIT);
        expect(checkRateLimit("u", LIMIT)).toMatchObject({ allowed: false, remaining: 0 });
    });

    it("reports when the oldest request leaves the window", () => {
        checkRateLimit("u", LIMIT);
        vi.advanceTimersByTime(10_000);
        checkRateLimit("u", LIMIT);
        checkRateLimit("u", LIMIT);
        expect(checkRateLimit("u", LIMIT).resetMs).toBe(50_000);
    });

    it("does not count blocked requests", () => {
        for (let i = 0; i < 5; i++) checkRateLimit("u", LIMIT);
        vi.advanceTimersByTime(60_001);
        expect(checkRateLimit("u", LIMIT)).toMatchObject({ allowed: true, remaining: 2 });
    });

    it("slides the window: requests older than windowMs stop counting", () => {
        checkRateLimit("u", LIMIT);
        vi.advanceTimersByTime(30_000);
        checkRateLimit("u", LIMIT);
        checkRateLimit("u", LIMIT);
        vi.advanceTimersByTime(30_001);
        expect(checkRateLimit("u", LIMIT).allowed).toBe(true);
        expect(checkRateLimit("u", LIMIT).allowed).toBe(false);
    });

    it("tracks keys independently", () => {
        for (let i = 0; i < 3; i++) checkRateLimit("a", LIMIT);
        expect(checkRateLimit("a", LIMIT).allowed).toBe(false);
        expect(checkRateLimit("b", LIMIT).allowed).toBe(true);
    });

    it("still works after the periodic cleanup runs", () => {
        for (let i = 0; i < 3; i++) checkRateLimit("u", LIMIT);
        vi.advanceTimersByTime(6 * 60_000);
        expect(checkRateLimit("other", LIMIT).allowed).toBe(true);
        expect(checkRateLimit("u", LIMIT)).toMatchObject({ allowed: true, remaining: 2 });
    });
});

describe("rateLimitResponse", () => {
    it("returns 429 with a Retry-After header in whole seconds", async () => {
        const res = rateLimitResponse(1_500);
        expect(res.status).toBe(429);
        expect(res.headers.get("Retry-After")).toBe("2");
        expect(await res.json()).toEqual({ error: expect.any(String), retryAfter: 2 });
    });
});
