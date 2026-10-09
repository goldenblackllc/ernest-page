// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    accessSummary,
    accountYear,
    canRefundMembership,
    canRefundUsedSession,
    checkReply,
    decideSessionStart,
    freeRemaining,
    membershipActive,
    usedSessionRefundsLeft,
    MAX_HISTORY_CHARS,
    SESSION_LIMITS,
    SESSION_MS,
    type AccessState,
    type Membership,
} from '../sessionAccess.js';

const DAY = 24 * 60 * 60 * 1000;
const SIGNUP = Date.UTC(2026, 0, 15);
const NOW = Date.UTC(2026, 9, 9, 12);
const TODAY = '2026-10-09';

function member(overrides: Partial<Membership> = {}): Membership {
    return { status: 'active', subscription_id: 'sub_1', current_period_end: NOW + 20 * DAY, started_at: NOW - 10 * DAY, ...overrides };
}

/** Starts sessions one after another, carrying the access state forward. */
function startMany(access: AccessState, n: number, now = NOW) {
    const sources: string[] = [];
    let state = access;
    for (let i = 0; i < n; i++) {
        const d = decideSessionStart(state, SIGNUP, now);
        if (!d.ok) { sources.push(d.reason); continue; }
        sources.push(d.source);
        state = d.access;
    }
    return { sources, state };
}

describe('free sessions', () => {
    it('gives five a year, then asks for payment', () => {
        const { sources } = startMany({}, 6, NOW);
        // Spread over two days so the daily limit doesn't interfere.
        expect(sources.slice(0, 5)).toEqual(['free', 'free', 'free', 'free', 'free']);
        expect(sources[5]).toBe('daily_limit');

        const day1 = startMany({}, 3, NOW).state;
        const day2 = startMany(day1, 3, NOW + DAY);
        expect(day2.sources).toEqual(['free', 'free', 'payment_required']);
    });

    it('renews on the signup anniversary, not January 1', () => {
        const used: AccessState = { free_year: accountYear(SIGNUP, NOW), free_used: 5 };
        expect(freeRemaining(used, SIGNUP, NOW)).toBe(0);
        expect(freeRemaining(used, SIGNUP, Date.UTC(2027, 0, 1))).toBe(0);
        expect(freeRemaining(used, SIGNUP, SIGNUP + 366 * DAY)).toBe(5);
    });

    it('treats an unknown signup date as year zero', () => {
        expect(accountYear(undefined, NOW)).toBe(0);
        expect(freeRemaining({ free_year: 0, free_used: 2 }, undefined, NOW)).toBe(3);
    });
});

describe('paid credits', () => {
    it('are used after the free sessions and count toward the refund rule', () => {
        const access: AccessState = { free_year: accountYear(SIGNUP, NOW), free_used: 5, credits: 2 };
        const d = decideSessionStart(access, SIGNUP, NOW);
        expect(d).toMatchObject({ ok: true, source: 'credit' });
        if (d.ok) {
            expect(d.access.credits).toBe(1);
            expect(d.access.paid_sessions_used).toBe(1);
        }
    });

    it('are not touched while free sessions remain', () => {
        const d = decideSessionStart({ credits: 3 }, SIGNUP, NOW);
        expect(d).toMatchObject({ ok: true, source: 'free' });
        if (d.ok) expect(d.access.credits).toBe(3);
    });
});

describe('membership', () => {
    it('comes first and never uses free sessions or credits', () => {
        const d = decideSessionStart({ membership: member(), credits: 3 }, SIGNUP, NOW);
        expect(d).toMatchObject({ ok: true, source: 'membership' });
        if (d.ok) {
            expect(d.access.credits).toBe(3);
            expect(d.access.free_used).toBeUndefined();
        }
    });

    it('is active through past_due but not after the period ends or once canceled', () => {
        expect(membershipActive(member({ status: 'past_due' }), NOW)).toBe(true);
        expect(membershipActive(member({ current_period_end: NOW - 1 }), NOW)).toBe(false);
        expect(membershipActive(member({ status: 'canceled' }), NOW)).toBe(false);
        expect(membershipActive(member({ status: 'incomplete' }), NOW)).toBe(false);
    });

    it('counts sessions in the first week for the refund rule', () => {
        const fresh = member({ started_at: NOW - DAY });
        const d = decideSessionStart({ membership: fresh }, SIGNUP, NOW);
        if (d.ok) expect(d.access.membership?.first_week_sessions).toBe(1);
        const old = decideSessionStart({ membership: member() }, SIGNUP, NOW);
        if (old.ok) expect(old.access.membership?.first_week_sessions).toBeUndefined();
    });
});

describe('daily limit', () => {
    it('allows five sessions a day for everyone, members included', () => {
        const { sources } = startMany({ membership: member() }, 6);
        expect(sources).toEqual(['membership', 'membership', 'membership', 'membership', 'membership', 'daily_limit']);
    });

    it('resets the next UTC day', () => {
        const full: AccessState = { membership: member(), sessions_today_date: TODAY, sessions_today: 5 };
        expect(decideSessionStart(full, SIGNUP, NOW)).toEqual({ ok: false, reason: 'daily_limit' });
        expect(decideSessionStart(full, SIGNUP, NOW + DAY)).toMatchObject({ ok: true });
    });
});

describe('accessSummary', () => {
    it('reports without changing anything', () => {
        const access: AccessState = { credits: 2, sessions_today_date: TODAY, sessions_today: 1 };
        const before = JSON.stringify(access);
        const s = accessSummary(access, SIGNUP, NOW);
        expect(s).toMatchObject({ canStart: true, source: 'free', freeRemaining: 5, credits: 2, sessionsToday: 1, sessionsPerDay: 5, membership: null });
        expect(s.freeRenewsAt).toBe(SIGNUP + 365 * DAY);
        expect(JSON.stringify(access)).toBe(before);
    });

    it('says payment_required when nothing is left', () => {
        const s = accessSummary({ free_year: accountYear(SIGNUP, NOW), free_used: 5 }, SIGNUP, NOW);
        expect(s).toMatchObject({ canStart: false, reason: 'payment_required' });
    });
});

describe('checkReply', () => {
    const grant = { source: 'free' as const, granted_at: NOW };
    const turns = (n: number) => Array.from({ length: n }, (_, i) => [
        { role: 'user', content: `q${i}` },
        { role: 'assistant', content: `a${i}` },
    ]).flat();

    it('refuses sessions that were never started', () => {
        expect(checkReply(undefined, turns(1), NOW)).toEqual({ ok: false, reason: 'no_session' });
    });

    it(`allows ${SESSION_LIMITS.turnsPerSession} turns and no more`, () => {
        expect(checkReply(grant, turns(30), NOW)).toEqual({ ok: true });
        expect(checkReply(grant, turns(31), NOW)).toEqual({ ok: false, reason: 'turn_limit' });
    });

    it(`ends after ${SESSION_LIMITS.sessionHours} hours`, () => {
        expect(checkReply(grant, turns(1), NOW + SESSION_MS)).toEqual({ ok: true });
        expect(checkReply(grant, turns(1), NOW + SESSION_MS + 1)).toEqual({ ok: false, reason: 'expired' });
    });

    it('refuses a stuffed history', () => {
        const stuffed = [{ role: 'assistant', content: 'x'.repeat(MAX_HISTORY_CHARS) }, { role: 'user', content: 'hi' }];
        expect(checkReply(grant, stuffed, NOW)).toEqual({ ok: false, reason: 'too_long' });
    });
});

describe('used-session refunds', () => {
    const session = { started_at: NOW - DAY, lot_id: 'pi_1', unit_price_cents: 10000, refunded_at: null };

    it('allows the first one right away', () => {
        expect(usedSessionRefundsLeft({ paid_sessions_used: 1 }, NOW)).toBe(1);
        expect(canRefundUsedSession({ paid_sessions_used: 1 }, session, NOW)).toEqual({ ok: true });
    });

    it('allows one per five paid sessions', () => {
        expect(usedSessionRefundsLeft({ paid_sessions_used: 5, session_refunds: [NOW - DAY] }, NOW)).toBe(0);
        expect(usedSessionRefundsLeft({ paid_sessions_used: 6, session_refunds: [NOW - DAY] }, NOW)).toBe(1);
    });

    it('allows at most three in any year', () => {
        const three = [NOW - 100 * DAY, NOW - 50 * DAY, NOW - DAY];
        expect(usedSessionRefundsLeft({ paid_sessions_used: 40, session_refunds: three }, NOW)).toBe(0);
        expect(usedSessionRefundsLeft({ paid_sessions_used: 40, session_refunds: three }, NOW + 266 * DAY)).toBe(1);
    });

    it('only within 7 days, and only once per session', () => {
        expect(canRefundUsedSession({ paid_sessions_used: 1 }, { ...session, started_at: NOW - 8 * DAY }, NOW)).toEqual({ ok: false, reason: 'too_late' });
        expect(canRefundUsedSession({ paid_sessions_used: 1 }, { ...session, refunded_at: NOW }, NOW)).toEqual({ ok: false, reason: 'already_refunded' });
        expect(canRefundUsedSession({ paid_sessions_used: 1 }, undefined, NOW)).toEqual({ ok: false, reason: 'not_refundable' });
    });
});

describe('complimentary memberships', () => {
    const comp = member({ subscription_id: 'comp', comp: true, current_period_end: Date.UTC(2100, 0, 1), started_at: NOW - DAY });

    it('give daily sessions like a paid membership', () => {
        expect(decideSessionStart({ membership: comp }, SIGNUP, NOW)).toMatchObject({ ok: true, source: 'membership' });
        expect(accessSummary({ membership: comp }, SIGNUP, NOW).membership).toMatchObject({ active: true, comp: true });
    });

    it('can never be refunded', () => {
        expect(canRefundMembership({ membership: comp }, NOW)).toEqual({ ok: false, reason: 'not_refundable' });
    });
});

describe('membership refunds', () => {
    it('allows a first membership within 7 days and 3 sessions', () => {
        expect(canRefundMembership({ membership: member({ started_at: NOW - 2 * DAY, first_week_sessions: 3 }) }, NOW)).toEqual({ ok: true });
    });

    it('refuses after 7 days, after 4 sessions, or a second time', () => {
        expect(canRefundMembership({ membership: member({ started_at: NOW - 8 * DAY }) }, NOW)).toEqual({ ok: false, reason: 'too_late' });
        expect(canRefundMembership({ membership: member({ started_at: NOW - DAY, first_week_sessions: 4 }) }, NOW)).toEqual({ ok: false, reason: 'limit' });
        expect(canRefundMembership({ membership: member({ started_at: NOW - DAY }), membership_refunded: true }, NOW)).toEqual({ ok: false, reason: 'already_refunded' });
        expect(canRefundMembership({}, NOW)).toEqual({ ok: false, reason: 'not_refundable' });
    });
});
