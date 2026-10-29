// @vitest-environment node
// /api/auth/send-code only texts US/CA numbers, and only within durable hourly limits (SMS pumping guard).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb, makeRequest } from "@/test/fakeFirestore";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakeFirestore")).firestoreModuleMock());

const createVerification = vi.fn(async (_opts: { to: string; channel: string }) => ({ status: "pending" }));
vi.mock("twilio", () => ({
    default: () => ({ verify: { v2: { services: () => ({ verifications: { create: createVerification } }) } } }),
}));

function post(body: unknown) {
    return makeRequest("http://localhost/api/auth/send-code", { body });
}

async function send(phone: unknown) {
    const { POST } = await import("../auth/send-code/route");
    return POST(post({ phone }));
}

beforeEach(() => {
    fakeDb.reset();
    createVerification.mockClear();
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe("POST /api/auth/send-code", () => {
    it("texts a US number in E.164 form", async () => {
        const res = await send("(212) 555-1234");
        expect(res.status).toBe(200);
        expect(createVerification).toHaveBeenCalledWith({ to: "+12125551234", channel: "sms" });
    });

    it("accepts Canadian numbers", async () => {
        const res = await send("+1 416 555 0199");
        expect(res.status).toBe(200);
        expect(createVerification).toHaveBeenCalledWith({ to: "+14165550199", channel: "sms" });
    });

    it.each([
        ["international", "+44 7700 900123"],
        ["Caribbean +1", "+1 876 555 1234"],
        ["Dominican Republic +1", "+1 809 555 1234"],
        ["invalid area code", "+1 012 555 1234"],
        ["too short", "212555123"],
    ])("rejects %s numbers without calling Twilio", async (_label, phone) => {
        const res = await send(phone);
        expect(res.status).toBe(400);
        expect(createVerification).not.toHaveBeenCalled();
    });

    it("lets test numbers through without texting", async () => {
        const res = await send("+11000000001");
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ isTestAccount: true });
        expect(createVerification).not.toHaveBeenCalled();
    });

    it("limits sends per phone number, stored in Firestore", async () => {
        for (let i = 0; i < 3; i++) expect((await send("2125551234")).status).toBe(200);
        const res = await send("2125551234");
        expect(res.status).toBe(429);
        expect(createVerification).toHaveBeenCalledTimes(3);
        expect(fakeDb.docs.get("sms_rate_limits/phone_+12125551234")?.ts).toHaveLength(3);
    });

    it("stops every send once the global hourly cap is reached", async () => {
        fakeDb.seed("sms_rate_limits/global", { ts: Array(60).fill(Date.now()) });
        const res = await send("2125551234");
        expect(res.status).toBe(429);
        expect(createVerification).not.toHaveBeenCalled();
    });

    it("ignores sends older than an hour", async () => {
        fakeDb.seed("sms_rate_limits/global", { ts: Array(60).fill(Date.now() - 2 * 60 * 60 * 1000) });
        const res = await send("2125551234");
        expect(res.status).toBe(200);
    });

    it("refuses to text in production when Turnstile is not configured", async () => {
        vi.stubEnv("VERCEL_ENV", "production");
        const res = await send("2125551234");
        expect(res.status).toBe(503);
        expect(createVerification).not.toHaveBeenCalled();
    });

    it("requires a Turnstile token when Turnstile is configured", async () => {
        vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
        const res = await send("2125551234");
        expect(res.status).toBe(403);
        expect(createVerification).not.toHaveBeenCalled();
    });
});
