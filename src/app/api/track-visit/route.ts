import { NextRequest, NextResponse } from 'next/server';
import { db, FieldValue } from '@/lib/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_EVENTS = new Set(['visit', 'landing', 'login']);

/**
 * Funnel-aware visit tracker.
 *
 * Accepts { event, visitorId } from the client-side useTrackEvent hook.
 * Deduplicates per visitor per day using a subcollection:
 *   funnel/{YYYY-MM-DD}/visitors/{visitorId} → { events: ['visit', 'landing', ...] }
 *
 * Aggregate counters on the parent doc:
 *   funnel/{YYYY-MM-DD} → { unique_visitors: N, landing_views: N, logins: N, date: '...' }
 *
 * Also maintains the legacy site_visits/{YYYY-MM-DD} counter for backward compat.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const event: string = body.event || 'visit';
        const visitorId: string = body.visitorId || '';

        if (!VALID_EVENTS.has(event) || !visitorId) {
            return NextResponse.json({ ok: true }, { status: 200 });
        }

        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
        const funnelRef = db.collection('funnel').doc(today);
        const visitorRef = funnelRef.collection('visitors').doc(visitorId);

        // Check if this visitor already sent this event today
        const visitorDoc = await visitorRef.get();
        const existingEvents: string[] = visitorDoc.exists
            ? (visitorDoc.data()?.events || [])
            : [];

        if (existingEvents.includes(event)) {
            // Already counted — skip
            return NextResponse.json({ ok: true, dedup: true }, { status: 200 });
        }

        // Map event name → aggregate field
        const fieldMap: Record<string, string> = {
            visit: 'unique_visitors',
            landing: 'landing_views',
            login: 'logins',
        };
        const field = fieldMap[event];

        // Batch: update visitor subcollection + increment aggregate counter
        const batch = db.batch();

        // Mark event as sent for this visitor
        batch.set(visitorRef, {
            events: FieldValue.arrayUnion(event),
        }, { merge: true });

        // Increment the aggregate counter
        batch.set(funnelRef, {
            [field]: FieldValue.increment(1),
            date: today,
        }, { merge: true });

        // Also increment legacy site_visits counter for backward compat
        if (event === 'visit') {
            const legacyRef = db.collection('site_visits').doc(today);
            batch.set(legacyRef, {
                count: FieldValue.increment(1),
                date: today,
            }, { merge: true });
        }

        await batch.commit();

        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (error: any) {
        console.error('[Track Visit]', error.message);
        // Never block the user — always return 200
        return NextResponse.json({ ok: true }, { status: 200 });
    }
}
