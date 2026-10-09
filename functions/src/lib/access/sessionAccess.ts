/**
 * The one access rule for Mirror sessions, shared by the website
 * (/api/check-session-access, /api/consume-session, payments) and the Mirror
 * Cloud Functions (mirrorReply, mirrorPlan). Pure functions, no imports, so the
 * website can import it through @functions/* without extra packages.
 *
 * Model (MANIFESTO.md §8):
 * - 5 free sessions per account year, counted from signup.
 * - Paid credits: $100 for one, $250 for three. Credits never expire.
 * - Membership: $1,000/month for daily use.
 * - Everyone: 5 sessions a day, 30 turns and 3 hours per session.
 *
 * Server-managed state lives in users/{uid}.access (see AccessState). Clients
 * can't write it (firestore.rules). A started session records how it was paid
 * for in users/{uid}/active_chats/{sessionId}.access (see SessionGrant).
 */

export const SESSION_LIMITS = {
    turnsPerSession: 30,
    sessionHours: 3,
    /** An open session with no activity for this long is closed by sweepExpiredChats. */
    idleMinutes: 60,
    sessionsPerDay: 5,
    freeSessionsPerYear: 5,
} as const;

export const SESSION_MS = SESSION_LIMITS.sessionHours * 60 * 60 * 1000;
export const IDLE_TIMEOUT_MS = SESSION_LIMITS.idleMinutes * 60 * 1000;

/** Cap on the conversation the client sends with each turn (all messages, characters). */
export const MAX_HISTORY_CHARS = 300_000;

const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * DAY_MS;

export const REFUND_RULES = {
    /** A used session can be refunded this many days after it started. */
    usedSessionDays: 7,
    /** One used-session refund per this many paid sessions (rounded up, so the first is allowed). */
    paidSessionsPerRefund: 5,
    /** And at most this many used-session refunds in any 365 days. */
    usedSessionRefundsPerYear: 3,
    /** A first membership is refundable for this many days... */
    membershipDays: 7,
    /** ...if no more than this many sessions were used. Once per account. */
    membershipMaxSessions: 3,
} as const;

export type SessionSource = 'free' | 'membership' | 'credit';

export interface Membership {
    status: 'active' | 'past_due' | 'incomplete' | 'canceled';
    subscription_id: string;
    /** ms */
    current_period_end: number;
    cancel_at_period_end?: boolean;
    /** ms: when this membership first became active */
    started_at: number;
    /** Sessions used in the first REFUND_RULES.membershipDays (for the membership refund rule) */
    first_week_sessions?: number;
}

/** users/{uid}.access — written only by the server. */
export interface AccessState {
    /** Paid credits remaining (sum of credits_remaining across credit lots) */
    credits?: number;
    /** Account year (from signup) that free_used counts */
    free_year?: number;
    free_used?: number;
    /** UTC day (YYYY-MM-DD) that sessions_today counts */
    sessions_today_date?: string;
    sessions_today?: number;
    /** Sessions started with a paid credit, ever (for the refund rule) */
    paid_sessions_used?: number;
    /** ms timestamps of used-session refunds */
    session_refunds?: number[];
    membership?: Membership | null;
    membership_refunded?: boolean;
    stripe_customer_id?: string;
    /** Where receipts and membership notices go; required before the first purchase */
    billing_email?: string;
    /** When access.free_* started counting, for accounts without created_at */
    free_anchor?: number;
    /** Characters of Mirror voice played today (UTC), for the daily budget in /api/tts */
    voice_usage?: { date: string; chars: number };
}

/** users/{uid}/active_chats/{sessionId}.access — how this session was paid for. */
export interface SessionGrant {
    source: SessionSource;
    /** ms */
    granted_at: number;
    /** credit lot (payment intent id) the credit came from, when source is 'credit' */
    lot_id?: string;
}

export type StartRefusal = 'daily_limit' | 'payment_required';

export type StartDecision =
    | { ok: true; source: SessionSource; access: AccessState }
    | { ok: false; reason: StartRefusal };

export function utcDay(now: number): string {
    return new Date(now).toISOString().split('T')[0];
}

/** Which account year `now` falls in, counting from signup (year 0 starts at signup). */
export function accountYear(signupMs: number | undefined, now: number): number {
    if (!signupMs || !Number.isFinite(signupMs) || signupMs > now) return 0;
    return Math.floor((now - signupMs) / YEAR_MS);
}

/** Start of the next account year, when free sessions renew (ms). */
export function freeRenewsAt(signupMs: number | undefined, now: number): number | null {
    if (!signupMs || !Number.isFinite(signupMs) || signupMs > now) return null;
    return signupMs + (accountYear(signupMs, now) + 1) * YEAR_MS;
}

export function freeRemaining(access: AccessState | undefined, signupMs: number | undefined, now: number): number {
    const used = access?.free_year === accountYear(signupMs, now) ? (access?.free_used || 0) : 0;
    return Math.max(0, SESSION_LIMITS.freeSessionsPerYear - used);
}

export function sessionsToday(access: AccessState | undefined, now: number): number {
    return access?.sessions_today_date === utcDay(now) ? (access?.sessions_today || 0) : 0;
}

/** Active or past_due (Stripe is still retrying the card) and inside the paid period. */
export function membershipActive(membership: Membership | null | undefined, now: number): boolean {
    if (!membership) return false;
    return (membership.status === 'active' || membership.status === 'past_due') && membership.current_period_end > now;
}

/**
 * Decide whether a new session may start and what it uses: membership first,
 * then free sessions, then paid credits. Returns the new access state to save.
 */
export function decideSessionStart(access: AccessState | undefined, signupMs: number | undefined, now: number): StartDecision {
    const today = sessionsToday(access, now);
    if (today >= SESSION_LIMITS.sessionsPerDay) return { ok: false, reason: 'daily_limit' };

    const base: AccessState = { ...access, sessions_today_date: utcDay(now), sessions_today: today + 1 };

    if (membershipActive(access?.membership, now)) {
        const m = access!.membership!;
        const inFirstWeek = now - m.started_at < REFUND_RULES.membershipDays * DAY_MS;
        return {
            ok: true,
            source: 'membership',
            access: inFirstWeek
                ? { ...base, membership: { ...m, first_week_sessions: (m.first_week_sessions || 0) + 1 } }
                : base,
        };
    }

    if (freeRemaining(access, signupMs, now) > 0) {
        const year = accountYear(signupMs, now);
        const used = access?.free_year === year ? (access?.free_used || 0) : 0;
        return { ok: true, source: 'free', access: { ...base, free_year: year, free_used: used + 1 } };
    }

    if ((access?.credits || 0) > 0) {
        return {
            ok: true,
            source: 'credit',
            access: { ...base, credits: access!.credits! - 1, paid_sessions_used: (access?.paid_sessions_used || 0) + 1 },
        };
    }

    return { ok: false, reason: 'payment_required' };
}

export interface AccessSummary {
    canStart: boolean;
    reason?: StartRefusal;
    /** What the next session would use */
    source?: SessionSource;
    freeRemaining: number;
    /** ms, or null if the signup date is unknown */
    freeRenewsAt: number | null;
    credits: number;
    membership: { active: boolean; renewsAt: number; cancelAtPeriodEnd: boolean } | null;
    sessionsToday: number;
    sessionsPerDay: number;
}

/** What the client needs to show before a session starts. Changes nothing. */
export function accessSummary(access: AccessState | undefined, signupMs: number | undefined, now: number): AccessSummary {
    const decision = decideSessionStart(access, signupMs, now);
    const m = access?.membership;
    return {
        canStart: decision.ok,
        ...(decision.ok ? { source: decision.source } : { reason: decision.reason }),
        freeRemaining: freeRemaining(access, signupMs, now),
        freeRenewsAt: freeRenewsAt(signupMs, now),
        credits: access?.credits || 0,
        membership: m && membershipActive(m, now)
            ? { active: true, renewsAt: m.current_period_end, cancelAtPeriodEnd: !!m.cancel_at_period_end }
            : null,
        sessionsToday: sessionsToday(access, now),
        sessionsPerDay: SESSION_LIMITS.sessionsPerDay,
    };
}

// ─── During a session ───────────────────────────────────────────────────────

export type ReplyRefusal = 'no_session' | 'expired' | 'turn_limit' | 'too_long';

interface MessageLike { role?: string; content?: unknown }

/** Whether the Mirror may answer this turn of a started session. */
export function checkReply(grant: SessionGrant | undefined, messages: MessageLike[], now: number): { ok: true } | { ok: false; reason: ReplyRefusal } {
    if (!grant?.source || !grant.granted_at) return { ok: false, reason: 'no_session' };
    if (now - grant.granted_at > SESSION_MS) return { ok: false, reason: 'expired' };
    const turns = messages.filter(m => m?.role === 'user').length;
    if (turns > SESSION_LIMITS.turnsPerSession) return { ok: false, reason: 'turn_limit' };
    const chars = messages.reduce((n, m) => n + (typeof m?.content === 'string' ? m.content.length : 0), 0);
    if (chars > MAX_HISTORY_CHARS) return { ok: false, reason: 'too_long' };
    return { ok: true };
}

// ─── Refunds ────────────────────────────────────────────────────────────────

export type RefundRefusal = 'too_late' | 'limit' | 'already_refunded' | 'not_refundable';

/** A session paid with a credit, as recorded in users/{uid}/paid_sessions/{sessionId}. */
export interface PaidSession {
    /** ms */
    started_at: number;
    lot_id: string;
    unit_price_cents: number;
    refunded_at?: number | null;
}

/** Used-session refunds still allowed now (0 when none). */
export function usedSessionRefundsLeft(access: AccessState | undefined, now: number): number {
    const refunds = access?.session_refunds || [];
    const byVolume = Math.ceil((access?.paid_sessions_used || 0) / REFUND_RULES.paidSessionsPerRefund) - refunds.length;
    const lastYear = refunds.filter(t => now - t < YEAR_MS).length;
    const byYear = REFUND_RULES.usedSessionRefundsPerYear - lastYear;
    return Math.max(0, Math.min(byVolume, byYear));
}

export function canRefundUsedSession(access: AccessState | undefined, session: PaidSession | undefined, now: number): { ok: true } | { ok: false; reason: RefundRefusal } {
    if (!session) return { ok: false, reason: 'not_refundable' };
    if (session.refunded_at) return { ok: false, reason: 'already_refunded' };
    if (now - session.started_at > REFUND_RULES.usedSessionDays * DAY_MS) return { ok: false, reason: 'too_late' };
    if (usedSessionRefundsLeft(access, now) <= 0) return { ok: false, reason: 'limit' };
    return { ok: true };
}

export function canRefundMembership(access: AccessState | undefined, now: number): { ok: true } | { ok: false; reason: RefundRefusal } {
    const m = access?.membership;
    if (access?.membership_refunded) return { ok: false, reason: 'already_refunded' };
    if (!m || !membershipActive(m, now)) return { ok: false, reason: 'not_refundable' };
    if (now - m.started_at > REFUND_RULES.membershipDays * DAY_MS) return { ok: false, reason: 'too_late' };
    if ((m.first_week_sessions || 0) > REFUND_RULES.membershipMaxSessions) return { ok: false, reason: 'limit' };
    return { ok: true };
}
