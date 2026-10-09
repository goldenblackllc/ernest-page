import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { normalizeEmail, readAccess, saveBillingEmail } from '@/lib/access/accessStore';
import { getStripe } from '@/lib/payments/stripe';

/**
 * POST /api/payments/email  { email }
 * Sets the address for receipts and membership notices. Required before the
 * first purchase; used for nothing else.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const rl = checkRateLimit(`payments:${uid}`, { maxRequests: 10, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { email: raw } = await req.json().catch(() => ({}));
        const email = normalizeEmail(raw);
        if (!email) return Response.json({ error: 'Invalid email' }, { status: 400 });

        const { access } = await readAccess(uid);
        await saveBillingEmail(uid, email);
        if (access.stripe_customer_id) {
            await getStripe().customers.update(access.stripe_customer_id, { email });
        }
        return Response.json({ email });
    } catch (error) {
        console.error('[Payments] Email error:', error);
        return Response.json({ error: 'Email could not be saved.' }, { status: 500 });
    }
}
