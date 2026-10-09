/**
 * Retry rules for processing a closed Mirror chat (users/{uid}/active_chats/{id}).
 *
 * processChat runs on every update to the chat doc, including its own writes.
 * A failed run writes { processing: false, lastErrorAt, processAttempts, retryAfter };
 * that write must not start another run, or a chat that always fails retries
 * forever. Retries come only from sweepExpiredChats, once retryAfter has passed.
 */

import { errorMessage } from './utils/errors.js';

export const MAX_PROCESS_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 15 * 60 * 1000;
export const STALE_CLAIM_MS = 10 * 60 * 1000;

type ChatDoc = FirebaseFirestore.DocumentData | undefined;

export type CloseDecision =
    | 'process'
    | 'not_closed'
    | 'in_progress'      // another run holds a fresh claim
    | 'own_claim'        // this update is our own processing: true write
    | 'own_error'        // this update is our own failure write
    | 'backing_off'      // retryAfter has not passed
    | 'gave_up';         // MAX_PROCESS_ATTEMPTS reached

export function closeDecision(before: ChatDoc, after: ChatDoc, now: number): CloseDecision {
    if (!after || after.isClosed !== true) return 'not_closed';
    if (after.processing === true && now - (after.processingStartedAt || 0) < STALE_CLAIM_MS) return 'in_progress';
    if (!before?.processing && after.processing === true) return 'own_claim';
    if (before?.processing === true && after.processing === false && after.lastErrorAt !== before?.lastErrorAt) return 'own_error';
    if ((after.processAttempts || 0) >= MAX_PROCESS_ATTEMPTS) return 'gave_up';
    if (after.retryAfter && after.retryAfter > now) return 'backing_off';
    return 'process';
}

/** Fields to write when a run fails. */
export function failureUpdate(after: ChatDoc, error: unknown, now: number) {
    const processAttempts = (after?.processAttempts || 0) + 1;
    return {
        processing: false,
        lastError: errorMessage(error).slice(0, 500),
        lastErrorAt: now,
        processAttempts,
        retryAfter: now + RETRY_BACKOFF_MS * processAttempts,
    };
}

/** Whether the sweep should poke a closed chat so processChat runs again. */
export function sweepShouldRetrigger(chat: ChatDoc, now: number): boolean {
    if (!chat || chat.isClosed !== true) return false;
    if ((chat.processAttempts || 0) >= MAX_PROCESS_ATTEMPTS) return false;
    if (chat.retryAfter && chat.retryAfter > now) return false;
    const staleClaim = chat.processing === true && now - (chat.processingStartedAt || 0) >= STALE_CLAIM_MS;
    return !chat.processing || staleClaim;
}
