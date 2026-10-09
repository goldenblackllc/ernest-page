/**
 * Firestore side of the session access rule (the rule itself is
 * functions/src/lib/access/sessionAccess.ts). Server only.
 *
 * users/{uid}.access                          AccessState (server-managed)
 * users/{uid}/credit_lots/{paymentIntentId}   CreditLot, one per credit purchase
 * users/{uid}/paid_sessions/{sessionId}       PaidSession, one per session paid with a credit
 * users/{uid}/active_chats/{sessionId}.access SessionGrant, how a session was paid for
 *
 * access.credits is the sum of credits_remaining over the lots; every change to
 * either happens in the same transaction.
 */
import { db } from '@/lib/firebase/admin';
import {
    decideSessionStart,
    canRefundUsedSession,
    canRefundMembership,
    type AccessState,
    type Membership,
    type PaidSession,
    type RefundRefusal,
    type SessionGrant,
    type SessionSource,
    type StartRefusal,
} from '@functions/lib/access/sessionAccess';
import type { CreditProduct } from '@/lib/payments/catalog';
import { unitPriceCents } from '@/lib/payments/catalog';

export interface CreditLot {
    product: string;
    credits_total: number;
    credits_remaining: number;
    unit_price_cents: number;
    amount_cents: number;
    /** ms */
    purchased_at: number;
    refunded_cents: number;
}

type UserData = FirebaseFirestore.DocumentData | undefined;

const userRef = (uid: string) => db.collection('users').doc(uid);

/** Signup time (ms) for the free-session year; falls back to when access was first used. */
export function signupMsFrom(userData: UserData): number | undefined {
    const created = userData?.created_at ?? userData?.createdAt;
    const ms = typeof created === 'string' ? Date.parse(created)
        : typeof created?.toMillis === 'function' ? created.toMillis()
        : typeof created === 'number' ? created
        : NaN;
    if (Number.isFinite(ms)) return ms;
    const anchor = userData?.access?.free_anchor;
    return typeof anchor === 'number' ? anchor : undefined;
}

export async function readAccess(uid: string) {
    const userData = (await userRef(uid).get()).data();
    return { userData, access: (userData?.access || {}) as AccessState, signupMs: signupMsFrom(userData) };
}

/** Oldest lot with credits left. */
export function pickLot(lots: { id: string; data: CreditLot }[]) {
    return lots
        .filter(l => (l.data.credits_remaining || 0) > 0)
        .sort((a, b) => a.data.purchased_at - b.data.purchased_at)[0];
}

export type StartResult =
    | { granted: true; source: SessionSource; resumed: boolean }
    | { granted: false; reason: StartRefusal };

/**
 * Start a session: apply the access rule, use up a free session, membership day
 * or credit, and record the grant on the active chat. Calling it again for a
 * session that already started changes nothing.
 */
export async function startSession(uid: string, sessionId: string, now = Date.now()): Promise<StartResult> {
    const uRef = userRef(uid);
    const chatRef = uRef.collection('active_chats').doc(sessionId);

    return db.runTransaction(async (tx) => {
        const [userSnap, chatSnap] = await Promise.all([tx.get(uRef), tx.get(chatRef)]);
        const existing = chatSnap.data()?.access as SessionGrant | undefined;
        if (existing?.source) return { granted: true, source: existing.source, resumed: true };

        const userData = userSnap.data();
        const access = (userData?.access || {}) as AccessState;
        const signupMs = signupMsFrom(userData);
        const decision = decideSessionStart(access, signupMs ?? now, now);
        if (!decision.ok) return { granted: false, reason: decision.reason };

        const grant: SessionGrant = { source: decision.source, granted_at: now };
        const newAccess: AccessState = { ...decision.access };
        if (signupMs === undefined) newAccess.free_anchor = now;

        if (decision.source === 'credit') {
            const lotsSnap = await tx.get(uRef.collection('credit_lots'));
            const lot = pickLot(lotsSnap.docs.map(d => ({ id: d.id, data: d.data() as CreditLot })));
            if (!lot) {
                // access.credits drifted from the lots; trust the lots.
                tx.set(uRef, { access: { credits: 0 } }, { merge: true });
                return { granted: false, reason: 'payment_required' };
            }
            grant.lot_id = lot.id;
            tx.update(uRef.collection('credit_lots').doc(lot.id), { credits_remaining: lot.data.credits_remaining - 1 });
            const paid: PaidSession = { started_at: now, lot_id: lot.id, unit_price_cents: lot.data.unit_price_cents, refunded_at: null };
            tx.set(uRef.collection('paid_sessions').doc(sessionId), paid);
        }

        tx.set(uRef, { access: newAccess }, { merge: true });
        tx.set(chatRef, { id: sessionId, uid, access: grant, createdAt: now, updatedAt: now }, { merge: true });
        return { granted: true, source: decision.source, resumed: false };
    });
}

/** Record a paid credit purchase. Safe to call more than once for the same payment. */
export async function grantCredits(uid: string, paymentIntentId: string, product: CreditProduct, amountCents: number, now = Date.now()) {
    const uRef = userRef(uid);
    const lotRef = uRef.collection('credit_lots').doc(paymentIntentId);
    return db.runTransaction(async (tx) => {
        const [lotSnap, userSnap] = await Promise.all([tx.get(lotRef), tx.get(uRef)]);
        if (lotSnap.exists) return { granted: false as const };
        const lot: CreditLot = {
            product: product.id,
            credits_total: product.credits,
            credits_remaining: product.credits,
            unit_price_cents: unitPriceCents(product),
            amount_cents: amountCents,
            purchased_at: now,
            refunded_cents: 0,
        };
        tx.set(lotRef, lot);
        const credits = (userSnap.data()?.access?.credits || 0) + product.credits;
        tx.set(uRef, { access: { credits } }, { merge: true });
        return { granted: true as const };
    });
}

export async function saveStripeCustomerId(uid: string, customerId: string) {
    await userRef(uid).set({ access: { stripe_customer_id: customerId } }, { merge: true });
}

export async function saveBillingEmail(uid: string, email: string) {
    await userRef(uid).set({ access: { billing_email: email } }, { merge: true });
}

/** A plausible email address, normalized; null if not. */
export function normalizeEmail(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const email = value.trim().toLowerCase();
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

/** Store the membership as Stripe reports it. Keeps started_at and first-week counts for the same subscription. */
export async function saveMembership(uid: string, update: Omit<Membership, 'started_at' | 'first_week_sessions'> & { first_invoice_id?: string }, now = Date.now()) {
    const uRef = userRef(uid);
    return db.runTransaction(async (tx) => {
        const current = (await tx.get(uRef)).data()?.access?.membership as (Membership & { first_invoice_id?: string }) | undefined;
        const same = current?.subscription_id === update.subscription_id;
        const membership = {
            ...update,
            started_at: same ? current!.started_at : now,
            first_week_sessions: same ? (current!.first_week_sessions || 0) : 0,
            first_invoice_id: same ? (current!.first_invoice_id || update.first_invoice_id || null) : (update.first_invoice_id || null),
        };
        // Overwrite the whole map so fields from an older subscription don't linger.
        tx.set(uRef, { access: { membership } }, { merge: true });
        return membership;
    });
}

// ─── Refunds ────────────────────────────────────────────────────────────────
// Each refund is reserved in Firestore first (so the credits can't also be
// spent), then sent to Stripe; if Stripe fails the reservation is undone.

export type RefundReservation =
    | { ok: true; paymentIntentId: string; amountCents: number; undo: () => Promise<void> }
    | { ok: false; reason: RefundRefusal };

/** Unused credits in one purchase, refunded at that purchase's per-session price. */
export async function reserveCreditRefund(uid: string, lotId: string, now = Date.now()): Promise<RefundReservation> {
    const uRef = userRef(uid);
    const lotRef = uRef.collection('credit_lots').doc(lotId);
    const reserved = await db.runTransaction(async (tx) => {
        const [lotSnap, userSnap] = await Promise.all([tx.get(lotRef), tx.get(uRef)]);
        const lot = lotSnap.data() as CreditLot | undefined;
        const remaining = lot?.credits_remaining || 0;
        if (!lot || remaining <= 0) return null;
        const amountCents = remaining * lot.unit_price_cents;
        tx.update(lotRef, { credits_remaining: 0, refunded_cents: (lot.refunded_cents || 0) + amountCents, refunded_at: now });
        const credits = Math.max(0, (userSnap.data()?.access?.credits || 0) - remaining);
        tx.set(uRef, { access: { credits } }, { merge: true });
        return { remaining, amountCents, lot };
    });
    if (!reserved) return { ok: false, reason: 'not_refundable' };

    return {
        ok: true,
        paymentIntentId: lotId,
        amountCents: reserved.amountCents,
        undo: () => db.runTransaction(async (tx) => {
            const userSnap = await tx.get(uRef);
            tx.update(lotRef, { credits_remaining: reserved.remaining, refunded_cents: reserved.lot.refunded_cents || 0, refunded_at: null });
            tx.set(uRef, { access: { credits: (userSnap.data()?.access?.credits || 0) + reserved.remaining } }, { merge: true });
        }),
    };
}

/** A session paid with a credit, within the used-session refund rule. */
export async function reserveSessionRefund(uid: string, sessionId: string, now = Date.now()): Promise<RefundReservation> {
    const uRef = userRef(uid);
    const paidRef = uRef.collection('paid_sessions').doc(sessionId);
    const result = await db.runTransaction(async (tx) => {
        const [paidSnap, userSnap] = await Promise.all([tx.get(paidRef), tx.get(uRef)]);
        const paid = paidSnap.data() as PaidSession | undefined;
        const access = (userSnap.data()?.access || {}) as AccessState;
        const check = canRefundUsedSession(access, paid, now);
        if (!check.ok) return { ok: false as const, reason: check.reason };
        tx.update(paidRef, { refunded_at: now });
        tx.set(uRef, { access: { session_refunds: [...(access.session_refunds || []), now] } }, { merge: true });
        return { ok: true as const, paid: paid!, refunds: access.session_refunds || [] };
    });
    if (!result.ok) return result;

    return {
        ok: true,
        paymentIntentId: result.paid.lot_id,
        amountCents: result.paid.unit_price_cents,
        undo: () => db.runTransaction(async (tx) => {
            const access = ((await tx.get(uRef)).data()?.access || {}) as AccessState;
            tx.update(paidRef, { refunded_at: null });
            tx.set(uRef, { access: { session_refunds: (access.session_refunds || []).filter(t => t !== now) } }, { merge: true });
        }),
    };
}

/** A first membership, within the membership refund rule. */
export async function reserveMembershipRefund(uid: string, now = Date.now()) {
    const uRef = userRef(uid);
    return db.runTransaction(async (tx) => {
        const access = ((await tx.get(uRef)).data()?.access || {}) as AccessState;
        const check = canRefundMembership(access, now);
        if (!check.ok) return { ok: false as const, reason: check.reason };
        tx.set(uRef, { access: { membership_refunded: true } }, { merge: true });
        const m = access.membership as Membership & { first_invoice_id?: string };
        return {
            ok: true as const,
            subscriptionId: m.subscription_id,
            firstInvoiceId: m.first_invoice_id || null,
            undo: () => uRef.set({ access: { membership_refunded: false } }, { merge: true }).then(() => {}),
        };
    });
}
