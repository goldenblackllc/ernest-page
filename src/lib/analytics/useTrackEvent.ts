'use client';

import { useCallback, useRef } from 'react';

type FunnelEvent = 'visit' | 'landing' | 'login';

const VISITOR_ID_KEY = 'ep-visitor-id';

/**
 * Returns a persistent anonymous visitor ID from localStorage.
 * Created once per browser, persists across sessions.
 */
function getOrCreateVisitorId(): string {
    if (typeof window === 'undefined') return '';
    try {
        let id = localStorage.getItem(VISITOR_ID_KEY);
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem(VISITOR_ID_KEY, id);
        }
        return id;
    } catch {
        // localStorage unavailable — generate ephemeral ID
        return crypto.randomUUID();
    }
}

/**
 * Lightweight funnel analytics hook.
 *
 * - Generates/reads a persistent anonymous visitor ID from localStorage
 * - Deduplicates events client-side: each event type fires at most once per page session
 * - Server-side dedup ensures once-per-visitor-per-day via Firestore subcollection
 * - Fire-and-forget: never blocks rendering or throws
 */
export function useTrackEvent() {
    // Track which events have already been sent this page session
    const sentEvents = useRef<Set<FunnelEvent>>(new Set());

    const trackEvent = useCallback((event: FunnelEvent) => {
        // Client-side dedup — don't send the same event twice per page load
        if (sentEvents.current.has(event)) return;
        sentEvents.current.add(event);

        const visitorId = getOrCreateVisitorId();
        if (!visitorId) return;

        // Fire-and-forget POST — never block the UI
        fetch('/api/track-visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, visitorId }),
        }).catch(() => {
            // Tracking should never break the site
        });
    }, []);

    return { trackEvent };
}
