// @vitest-environment node
// Session start, credit purchases, refunds and the Stripe webhook, against the
// fake Firestore (with transactions) and a mocked Stripe client.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeDb, makeRequest, VALID_TOKEN, TEST_UID } from "@/test/fakeFirestore";

vi.mock("@/lib/firebase/admin", async () => (await import("@/test/fakeFirestore")).adminModuleMock());
vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakeFirestore")).firestoreModuleMock());
vi.mock("firebase-admin/auth", async () => (await import("@/test/fakeFirestore")).authModuleMock());

const CARD = { id: "pm_visa", card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 } };
const CARD2 = { id: "pm_mc", card: { brand: "mastercard", last4: "4444", exp_month: 1, exp_year: 2031 } };

const stripe = {
    customers: {
        create: vi.fn(async () => ({ id: "cus_1" })),
        update: vi.fn(async () => ({})),
        retrieve: vi.fn(async () => ({ id: "cus_1", invoice_settings: { default_payment_method: "pm_visa" } })),
        listPaymentMethods: vi.fn(async () => ({ data: [CARD2, CARD] })),
    },
    paymentMethods: { detach: vi.fn(async () => ({})) },
    setupIntents: { create: vi.fn(async () => ({ client_secret: "seti_secret" })) },
    paymentIntents: {
        create: vi.fn(async (p: { amount: number; confirm?: boolean }) => ({ id: "pi_new", client_secret: "pi_secret", amount: p.amount, status: p.confirm ? "succeeded" : "requires_payment_method" })),
        list: vi.fn(),
        retrieve: vi.fn(),
    },
    refunds: {
        create: vi.fn(async (p: { amount?: number }) => ({ id: "re_1", amount: p.amount ?? 100000 })),
        list: vi.fn(async () => ({ data: [] })),
    },
    subscriptions: {
        retrieve: vi.fn(),
        update: vi.fn(async () => ({})),
        cancel: vi.fn(async () => subscription({ status: "canceled" })),
    },
    invoices: { list: vi.fn(async () => ({ data: [] })) },
    invoicePayments: { list: vi.fn(async () => ({ data: [{ payment: { payment_intent: "pi_member" } }] })) },
    webhooks: { constructEvent: vi.fn() },
};

// Rate limits are covered in conventions.test.ts; here they'd only couple the tests together.
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: () => ({ allowed: true, remaining: 1, resetMs: 0 }), rateLimitResponse: () => new Response(null, { status: 429 }) }));

vi.mock("@/lib/payments/stripe", () => ({
    getStripe: () => stripe,
    getMembershipPriceId: async () => "price_member",
}));

const USER = `users/${TEST_UID}`;
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const SIGNUP = new Date(NOW - 30 * DAY).toISOString();
const year0Used = { free_year: 0, free_used: 5 };

function subscription(overrides: Record<string, unknown> = {}) {
    return {
        id: "sub_1",
        status: "active",
        cancel_at_period_end: false,
        metadata: { uid: TEST_UID },
        items: { data: [{ current_period_end: Math.floor((NOW + 30 * DAY) / 1000) }] },
        ...overrides,
    };
}

function post(path: string, body?: unknown) {
    return makeRequest(`http://localhost/api/${path}`, { token: VALID_TOKEN, body: body ?? {} });
}

/** A stored document, loosely typed for assertions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;
function doc(path: string) {
    return fakeDb.docs.get(path) as Loose | undefined;
}

beforeEach(() => {
    fakeDb.reset();
    Object.values(stripe).forEach((group) => Object.values(group).forEach((fn) => (fn as { mockClear?: () => void }).mockClear?.()));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe("POST /api/consume-session", () => {
    it("starts a free session and records the grant on the chat", async () => {
        fakeDb.seed(USER, { created_at: SIGNUP });
        const { POST } = await import("../consume-session/route");
        const res = await POST(post("consume-session", { sessionId: "session-0001" }));
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ granted: true, source: "free", resumed: false });
        expect(doc(`${USER}/active_chats/session-0001`)?.access).toMatchObject({ source: "free" });
        expect(doc(USER)?.access).toMatchObject({ free_used: 1, sessions_today: 1 });
    });

    it("doesn't charge twice for the same session", async () => {
        fakeDb.seed(USER, { created_at: SIGNUP });
        const { POST } = await import("../consume-session/route");
        await POST(post("consume-session", { sessionId: "session-0001" }));
        const again = await (await POST(post("consume-session", { sessionId: "session-0001" }))).json();
        expect(again).toMatchObject({ granted: true, resumed: true });
        expect(doc(USER)?.access.free_used).toBe(1);
    });

    it("uses the oldest credit lot and records the paid session", async () => {
        fakeDb.seed(USER, { created_at: SIGNUP, access: { ...year0Used, credits: 4 } });
        fakeDb.seed(`${USER}/credit_lots/pi_new`, { credits_remaining: 3, unit_price_cents: 8333, purchased_at: NOW - DAY });
        fakeDb.seed(`${USER}/credit_lots/pi_old`, { credits_remaining: 1, unit_price_cents: 10000, purchased_at: NOW - 9 * DAY });
        const { POST } = await import("../consume-session/route");
        const res = await POST(post("consume-session", { sessionId: "session-0002" }));
        expect(await res.json()).toMatchObject({ granted: true, source: "credit" });
        expect(doc(`${USER}/credit_lots/pi_old`)?.credits_remaining).toBe(0);
        expect(doc(`${USER}/credit_lots/pi_new`)?.credits_remaining).toBe(3);
        expect(doc(USER)?.access).toMatchObject({ credits: 3, paid_sessions_used: 1 });
        expect(doc(`${USER}/paid_sessions/session-0002`)).toMatchObject({ lot_id: "pi_old", unit_price_cents: 10000 });
        expect(doc(`${USER}/active_chats/session-0002`)?.access).toMatchObject({ source: "credit", lot_id: "pi_old" });
    });

    it("returns 402 when nothing is left to pay with", async () => {
        fakeDb.seed(USER, { created_at: SIGNUP, access: year0Used });
        const { POST } = await import("../consume-session/route");
        const res = await POST(post("consume-session", { sessionId: "session-0003" }));
        expect(res.status).toBe(402);
        expect(await res.json()).toMatchObject({ granted: false, reason: "payment_required" });
        expect(doc(`${USER}/active_chats/session-0003`)).toBeUndefined();
    });

    it("returns 429 at the daily limit", async () => {
        const today = new Date(NOW).toISOString().split("T")[0];
        fakeDb.seed(USER, { created_at: SIGNUP, access: { sessions_today_date: today, sessions_today: 5 } });
        const { POST } = await import("../consume-session/route");
        const res = await POST(post("consume-session", { sessionId: "session-0004" }));
        expect(res.status).toBe(429);
        expect(await res.json()).toMatchObject({ reason: "daily_limit" });
    });

    it("rejects a missing session id", async () => {
        const { POST } = await import("../consume-session/route");
        expect((await POST(post("consume-session", {}))).status).toBe(400);
    });
});

const EMAIL = { access: { billing_email: "me@example.com" } };

describe("POST /api/payments/purchase", () => {
    it("asks for a receipt email before the first purchase", async () => {
        fakeDb.seed(USER, {});
        const { POST } = await import("../payments/purchase/route");
        const res = await POST(post("payments/purchase", { product: "single" }));
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ reason: "email_required" });
        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it("saves the card for next time when asked", async () => {
        fakeDb.seed(USER, EMAIL);
        const { POST } = await import("../payments/purchase/route");
        await POST(post("payments/purchase", { product: "single", saveCard: true }));
        expect(stripe.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({ setup_future_usage: "off_session", receipt_email: "me@example.com" }));
    });

    it("charges a saved card right away, but only the user's own", async () => {
        fakeDb.seed(USER, { access: { billing_email: "me@example.com", stripe_customer_id: "cus_1" } });
        const { POST } = await import("../payments/purchase/route");
        const res = await POST(post("payments/purchase", { product: "single", paymentMethodId: "pm_visa" }));
        expect(await res.json()).toMatchObject({ status: "succeeded" });
        expect(stripe.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({ payment_method: "pm_visa", confirm: true }));
        expect((await POST(post("payments/purchase", { product: "single", paymentMethodId: "pm_someone_else" }))).status).toBe(404);
    });

    it("creates a PaymentIntent for the product's price, with no redirect methods", async () => {
        fakeDb.seed(USER, EMAIL);
        const { POST } = await import("../payments/purchase/route");
        const res = await POST(post("payments/purchase", { product: "pack3" }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ clientSecret: "pi_secret", amountCents: 25000 });
        expect(stripe.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({
            amount: 25000,
            customer: "cus_1",
            automatic_payment_methods: { enabled: true, allow_redirects: "never" },
            metadata: { uid: TEST_UID, kind: "credits", product: "pack3" },
        }));
    });

    it("ignores client-sent prices and unknown products", async () => {
        const { POST } = await import("../payments/purchase/route");
        expect((await POST(post("payments/purchase", { product: "free", amount: 1 }))).status).toBe(400);
        expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });
});

describe("POST /api/payments/webhook", () => {
    async function deliver(event: unknown) {
        stripe.webhooks.constructEvent.mockReturnValueOnce(event);
        const { POST } = await import("../payments/webhook/route");
        return POST(new Request("http://localhost/api/payments/webhook", {
            method: "POST",
            headers: { "stripe-signature": "t=1,v1=sig" },
            body: "{}",
        }));
    }

    const paid = (product: string, id = "pi_paid") => ({
        id: "evt_1",
        type: "payment_intent.succeeded",
        data: { object: { id, amount: 25000, amount_received: 25000, metadata: { uid: TEST_UID, kind: "credits", product } } },
    });

    it("rejects a bad signature", async () => {
        stripe.webhooks.constructEvent.mockImplementationOnce(() => { throw new Error("bad sig"); });
        const { POST } = await import("../payments/webhook/route");
        const res = await POST(new Request("http://localhost/api/payments/webhook", { method: "POST", headers: { "stripe-signature": "x" }, body: "{}" }));
        expect(res.status).toBe(400);
        expect(fakeDb.writes).toEqual([]);
    });

    it("grants credits once per payment, even if Stripe delivers twice", async () => {
        fakeDb.seed(USER, { access: { credits: 1 } });
        expect((await deliver(paid("pack3"))).status).toBe(200);
        expect((await deliver(paid("pack3"))).status).toBe(200);
        expect(doc(USER)?.access.credits).toBe(4);
        expect(doc(`${USER}/credit_lots/pi_paid`)).toMatchObject({ credits_total: 3, credits_remaining: 3, unit_price_cents: 8333 });
    });

    it("activates a membership on invoice.paid", async () => {
        fakeDb.seed(USER, {});
        stripe.subscriptions.retrieve.mockResolvedValueOnce(subscription());
        const res = await deliver({
            id: "evt_2",
            type: "invoice.paid",
            data: { object: { id: "in_1", parent: { subscription_details: { subscription: "sub_1" } } } },
        });
        expect(res.status).toBe(200);
        expect(doc(USER)?.access.membership).toMatchObject({ status: "active", subscription_id: "sub_1", first_invoice_id: "in_1", first_week_sessions: 0 });
    });

    it("makes a card added in Billing the default when asked", async () => {
        await deliver({
            id: "evt_4",
            type: "setup_intent.succeeded",
            data: { object: { payment_method: "pm_new", customer: "cus_1", metadata: { purpose: "add_card", make_default: "true", subscription_id: "sub_1" } } },
        });
        expect(stripe.customers.update).toHaveBeenCalledWith("cus_1", { invoice_settings: { default_payment_method: "pm_new" } });
        expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_1", { default_payment_method: "pm_new" });
    });

    it("ignores payments that aren't credit purchases", async () => {
        fakeDb.seed(USER, {});
        await deliver({ id: "evt_3", type: "payment_intent.succeeded", data: { object: { id: "pi_x", amount: 100, metadata: {} } } });
        expect(fakeDb.writes).toEqual([]);
    });
});

describe("POST /api/payments/email", () => {
    it("saves a valid address and updates the Stripe customer", async () => {
        fakeDb.seed(USER, { access: { stripe_customer_id: "cus_1" } });
        const { POST } = await import("../payments/email/route");
        const res = await POST(post("payments/email", { email: "  Me@Example.com " }));
        expect(await res.json()).toEqual({ email: "me@example.com" });
        expect(fakeDb.writes).toContainEqual({ op: "set", path: USER, data: { access: { billing_email: "me@example.com" } } });
        expect(stripe.customers.update).toHaveBeenCalledWith("cus_1", { email: "me@example.com" });
    });

    it("rejects an invalid address", async () => {
        const { POST } = await import("../payments/email/route");
        expect((await POST(post("payments/email", { email: "not-an-email" }))).status).toBe(400);
        expect(fakeDb.writes).toEqual([]);
    });
});

describe("/api/payments/methods", () => {
    const member = { status: "active", subscription_id: "sub_1", current_period_end: NOW + 20 * DAY, started_at: NOW - 10 * DAY };

    it("lists saved cards, default first", async () => {
        fakeDb.seed(USER, { access: { stripe_customer_id: "cus_1" } });
        const { GET } = await import("../payments/methods/route");
        const res = await GET(makeRequest("http://localhost/api/payments/methods", { method: "GET", token: VALID_TOKEN }));
        const { cards } = await res.json();
        expect(cards.map((c: { id: string; isDefault: boolean }) => [c.id, c.isDefault])).toEqual([["pm_visa", true], ["pm_mc", false]]);
    });

    it("makes a card the default, on the membership too", async () => {
        fakeDb.seed(USER, { access: { stripe_customer_id: "cus_1", membership: member } });
        const { POST } = await import("../payments/methods/route");
        await POST(post("payments/methods", { action: "default", paymentMethodId: "pm_mc" }));
        expect(stripe.customers.update).toHaveBeenCalledWith("cus_1", { invoice_settings: { default_payment_method: "pm_mc" } });
        expect(stripe.subscriptions.update).toHaveBeenCalledWith("sub_1", { default_payment_method: "pm_mc" });
    });

    it("won't remove the membership's default card, but removes others", async () => {
        fakeDb.seed(USER, { access: { stripe_customer_id: "cus_1", membership: member } });
        const { POST } = await import("../payments/methods/route");
        const blocked = await POST(post("payments/methods", { action: "remove", paymentMethodId: "pm_visa" }));
        expect(blocked.status).toBe(409);
        expect(await blocked.json()).toMatchObject({ reason: "membership_default" });
        await POST(post("payments/methods", { action: "remove", paymentMethodId: "pm_mc" }));
        expect(stripe.paymentMethods.detach).toHaveBeenCalledTimes(1);
        expect(stripe.paymentMethods.detach).toHaveBeenCalledWith("pm_mc");
    });

    it("refuses cards that aren't the user's", async () => {
        fakeDb.seed(USER, { access: { stripe_customer_id: "cus_1" } });
        const { POST } = await import("../payments/methods/route");
        expect((await POST(post("payments/methods", { action: "remove", paymentMethodId: "pm_other" }))).status).toBe(404);
        expect(stripe.paymentMethods.detach).not.toHaveBeenCalled();
    });
});

describe("history and receipts", () => {
    const pi = (overrides: Record<string, unknown> = {}) => ({
        id: "pi_paid", status: "succeeded", customer: "cus_1", created: Math.floor(NOW / 1000), amount: 25000, amount_received: 25000, currency: "usd",
        metadata: { kind: "credits", product: "pack3" },
        latest_charge: { amount_refunded: 8333, receipt_number: "1234-5678", payment_method_details: { card: { brand: "visa", last4: "4242" } } },
        ...overrides,
    });

    it("lists successful payments with refunds", async () => {
        fakeDb.seed(USER, { access: { stripe_customer_id: "cus_1" } });
        stripe.paymentIntents.list.mockResolvedValueOnce({ data: [pi(), pi({ id: "pi_failed", status: "requires_payment_method" }), pi({ id: "pi_member", metadata: {} })] });
        const { GET } = await import("../payments/history/route");
        const { items } = await (await GET(makeRequest("http://localhost/api/payments/history", { method: "GET", token: VALID_TOKEN }))).json();
        expect(items).toMatchObject([
            { id: "pi_paid", item: "pack3", amountCents: 25000, refundedCents: 8333, card: { brand: "visa", last4: "4242" } },
            { id: "pi_member", item: "membership" },
        ]);
    });

    it("shows a receipt only to its owner", async () => {
        fakeDb.seed(USER, { access: { stripe_customer_id: "cus_1", billing_email: "me@example.com" } });
        const { GET } = await import("../payments/receipt/route");
        stripe.paymentIntents.retrieve.mockResolvedValueOnce(pi());
        const ok = await GET(makeRequest("http://localhost/api/payments/receipt?id=pi_paid", { method: "GET", token: VALID_TOKEN }));
        expect(await ok.json()).toMatchObject({ receiptNumber: "1234-5678", billingEmail: "me@example.com", amountCents: 25000 });

        stripe.paymentIntents.retrieve.mockResolvedValueOnce(pi({ customer: "cus_someone_else" }));
        const other = await GET(makeRequest("http://localhost/api/payments/receipt?id=pi_paid", { method: "GET", token: VALID_TOKEN }));
        expect(other.status).toBe(404);
    });
});

describe("POST /api/payments/refund", () => {
    it("refunds unused credits at the purchase's per-session price", async () => {
        fakeDb.seed(USER, { access: { credits: 2 } });
        fakeDb.seed(`${USER}/credit_lots/pi_pack`, { credits_total: 3, credits_remaining: 2, unit_price_cents: 8333, refunded_cents: 0, purchased_at: NOW });
        const { POST } = await import("../payments/refund/route");
        const res = await POST(post("payments/refund", { kind: "credits", lotId: "pi_pack" }));
        expect(await res.json()).toEqual({ refunded: true, amountCents: 16666 });
        expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_pack", amount: 16666 }), expect.anything());
        expect(doc(USER)?.access.credits).toBe(0);
        expect(doc(`${USER}/credit_lots/pi_pack`)?.credits_remaining).toBe(0);
    });

    it("gives the credits back if Stripe refuses the refund", async () => {
        fakeDb.seed(USER, { access: { credits: 1 } });
        fakeDb.seed(`${USER}/credit_lots/pi_one`, { credits_total: 1, credits_remaining: 1, unit_price_cents: 10000, refunded_cents: 0, purchased_at: NOW });
        stripe.refunds.create.mockRejectedValueOnce(new Error("stripe down"));
        const { POST } = await import("../payments/refund/route");
        const res = await POST(post("payments/refund", { kind: "credits", lotId: "pi_one" }));
        expect(res.status).toBe(500);
        expect(doc(USER)?.access.credits).toBe(1);
        expect(doc(`${USER}/credit_lots/pi_one`)?.credits_remaining).toBe(1);
    });

    it("refunds a used session within the rule, then refuses the next one", async () => {
        fakeDb.seed(USER, { access: { paid_sessions_used: 2, session_refunds: [] } });
        fakeDb.seed(`${USER}/paid_sessions/s1`, { started_at: NOW - DAY, lot_id: "pi_one", unit_price_cents: 10000, refunded_at: null });
        fakeDb.seed(`${USER}/paid_sessions/s2`, { started_at: NOW - DAY, lot_id: "pi_one", unit_price_cents: 10000, refunded_at: null });
        const { POST } = await import("../payments/refund/route");
        const first = await POST(post("payments/refund", { kind: "session", sessionId: "s1" }));
        expect(await first.json()).toEqual({ refunded: true, amountCents: 10000 });
        const second = await POST(post("payments/refund", { kind: "session", sessionId: "s2" }));
        expect(second.status).toBe(409);
        expect(await second.json()).toMatchObject({ reason: "limit" });
        expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
    });

    it("refunds and ends a first membership", async () => {
        fakeDb.seed(USER, {
            access: { membership: { status: "active", subscription_id: "sub_1", current_period_end: NOW + 29 * DAY, started_at: NOW - DAY, first_week_sessions: 1, first_invoice_id: "in_1" } },
        });
        const { POST } = await import("../payments/refund/route");
        const res = await POST(post("payments/refund", { kind: "membership" }));
        expect(await res.json()).toEqual({ refunded: true, amountCents: 100000 });
        expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_member" }), expect.anything());
        expect(stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1");
        expect(doc(USER)?.access).toMatchObject({ membership_refunded: true, membership: { status: "canceled" } });
    });
});
