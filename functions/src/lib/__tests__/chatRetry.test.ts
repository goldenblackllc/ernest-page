// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { closeDecision, failureUpdate, sweepShouldRetrigger, MAX_PROCESS_ATTEMPTS } from '../chatRetry.js';

const NOW = 1_800_000_000_000;
const MIN = 60_000;

describe('closeDecision', () => {
    it('processes a chat the moment it closes', () => {
        expect(closeDecision({ isClosed: false }, { isClosed: true }, NOW)).toBe('process');
    });

    it('ignores open chats', () => {
        expect(closeDecision({}, { isClosed: false }, NOW)).toBe('not_closed');
    });

    it('ignores its own claim write and fresh claims', () => {
        const claimed = { isClosed: true, processing: true, processingStartedAt: NOW };
        expect(closeDecision({ isClosed: true }, claimed, NOW)).toBe('in_progress');
        expect(closeDecision({ isClosed: true }, { ...claimed, processingStartedAt: NOW - 11 * MIN }, NOW)).toBe('own_claim');
    });

    it('does not re-run on its own failure write (the old infinite loop)', () => {
        const before = { isClosed: true, processing: true, processingStartedAt: NOW - MIN };
        const after = { isClosed: true, ...failureUpdate(before, new Error('boom'), NOW) };
        expect(closeDecision(before, after, NOW)).toBe('own_error');
    });

    it('waits out the backoff, then lets the sweep retry', () => {
        const failed = { isClosed: true, ...failureUpdate({}, new Error('boom'), NOW) };
        const poked = { ...failed, _triggerCron: NOW + MIN };
        expect(closeDecision(failed, poked, NOW + MIN)).toBe('backing_off');
        expect(closeDecision(failed, poked, NOW + 16 * MIN)).toBe('process');
    });

    it('gives up after the attempt limit', () => {
        const after = { isClosed: true, processing: false, processAttempts: MAX_PROCESS_ATTEMPTS };
        expect(closeDecision(after, { ...after, _triggerCron: NOW }, NOW)).toBe('gave_up');
    });
});

describe('failureUpdate', () => {
    it('counts attempts and backs off longer each time', () => {
        const first = failureUpdate({}, new Error('x'), NOW);
        const second = failureUpdate(first, new Error('x'), NOW);
        expect(first.processAttempts).toBe(1);
        expect(second.processAttempts).toBe(2);
        expect(second.retryAfter - NOW).toBeGreaterThan(first.retryAfter - NOW);
        expect(first.processing).toBe(false);
    });
});

describe('sweepShouldRetrigger', () => {
    it('retries closed chats that were never picked up', () => {
        expect(sweepShouldRetrigger({ isClosed: true }, NOW)).toBe(true);
    });

    it('leaves fresh claims, backoff and exhausted chats alone', () => {
        expect(sweepShouldRetrigger({ isClosed: true, processing: true, processingStartedAt: NOW - MIN }, NOW)).toBe(false);
        expect(sweepShouldRetrigger({ isClosed: true, retryAfter: NOW + MIN }, NOW)).toBe(false);
        expect(sweepShouldRetrigger({ isClosed: true, processAttempts: MAX_PROCESS_ATTEMPTS }, NOW)).toBe(false);
    });

    it('recovers a stale claim from a crashed run', () => {
        expect(sweepShouldRetrigger({ isClosed: true, processing: true, processingStartedAt: NOW - 11 * MIN }, NOW)).toBe(true);
    });

    it('ignores open chats', () => {
        expect(sweepShouldRetrigger({ isClosed: false }, NOW)).toBe(false);
    });
});
