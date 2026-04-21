import { NextResponse } from 'next/server';
import { db, FieldValue } from '@/lib/firebase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lightweight visit counter.
 * Middleware fires a POST here on every page navigation.
 * We increment a daily counter doc: site_visits/{YYYY-MM-DD}
 */
export async function POST() {
    try {
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
        const ref = db.collection('site_visits').doc(today);

        await ref.set(
            { count: FieldValue.increment(1), date: today },
            { merge: true },
        );

        return NextResponse.json({ ok: true }, { status: 200 });
    } catch (error: any) {
        console.error('[Track Visit]', error.message);
        // Never block the user — always return 200
        return NextResponse.json({ ok: true }, { status: 200 });
    }
}
