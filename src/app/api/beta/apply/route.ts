import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { nanoid } from 'nanoid';
import nodemailer from 'nodemailer';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'breadstand@gmail.com';

/**
 * POST /api/beta/apply
 * Self-serve beta application: auto-creates an invite code, redeems it,
 * and stores the applicant's payment info for the $20 UGC compensation.
 *
 * Body: { paymentMethod: 'venmo' | 'cashapp', paymentHandle: string, source?: string }
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const body = await req.json();
        const { paymentMethod, paymentHandle, source = 'tiktok' } = body;

        if (!paymentMethod || !paymentHandle) {
            return Response.json({ error: 'Payment method and handle are required.' }, { status: 400 });
        }

        // Check if user already has an active beta subscription
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        if (userData?.subscription?.status === 'active' && userData?.subscription?.grantedBy === 'beta_invite') {
            return Response.json({ error: 'You already have beta access.' }, { status: 400 });
        }

        // Create and immediately redeem a beta invite code
        const code = nanoid(12);
        const cohort = 'tiktok-ugc-june-2026';
        const now = new Date();
        const expiry = new Date(now);
        expiry.setDate(expiry.getDate() + 30);
        const subscribedAt = now.toISOString();
        const subscribedUntil = expiry.toISOString();

        // Create the invite (already redeemed)
        await db.collection('beta_invites').doc(code).set({
            code,
            createdAt: subscribedAt,
            createdBy: 'self-serve',
            cohort,
            source,
            status: 'redeemed',
            recipientUid: uid,
            redeemedAt: subscribedAt,
        });

        // Grant subscription + tag as beta tester
        await db.collection('users').doc(uid).set(
            {
                subscription: {
                    status: 'active',
                    plan: 'archangel',
                    subscribedAt,
                    subscribedUntil,
                    grantedBy: 'beta_invite',
                },
                beta_tester: {
                    cohort,
                    enrolled_at: subscribedAt,
                    invite_code: code,
                    source,
                },
                // Beta testers default to community so their posts fill the feed
                default_post_routing: 'community',
            },
            { merge: true }
        );

        // Store application data (payment info for compensation)
        await db.collection('beta_applications').doc(uid).set({
            uid,
            paymentMethod,
            paymentHandle,
            source,
            invite_code: code,
            cohort,
            appliedAt: subscribedAt,
            compensationStatus: 'pending', // pending → paid after session completion
            compensationAmount: 20,
        });

        console.log(`Beta apply: User ${uid} self-enrolled [cohort: ${cohort}, payment: ${paymentMethod}/${paymentHandle}]`);

        // ── Send notification email ──
        try {
            if (process.env.GMAIL_APP_PASSWORD) {
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: ADMIN_EMAIL,
                        pass: process.env.GMAIL_APP_PASSWORD,
                    },
                });

                await transporter.sendMail({
                    from: `Earnest Page <${ADMIN_EMAIL}>`,
                    to: ADMIN_EMAIL,
                    subject: `🎉 New Beta Signup — ${paymentMethod} ${paymentHandle}`,
                    html: `
<div style="font-family: -apple-system, sans-serif; background: #09090b; color: #d4d4d8; padding: 32px; border-radius: 12px; max-width: 400px;">
    <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #71717a; margin: 0 0 16px 0;">New Beta Application</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 8px 0; color: #71717a;">User ID</td><td style="padding: 8px 0; text-align: right; color: #e4e4e7; font-family: monospace; font-size: 12px;">${uid}</td></tr>
        <tr><td style="padding: 8px 0; color: #71717a;">Payment</td><td style="padding: 8px 0; text-align: right; color: #34d399; font-weight: 600;">${paymentMethod} — ${paymentHandle}</td></tr>
        <tr><td style="padding: 8px 0; color: #71717a;">Source</td><td style="padding: 8px 0; text-align: right; color: #e4e4e7;">${source}</td></tr>
        <tr><td style="padding: 8px 0; color: #71717a;">Cohort</td><td style="padding: 8px 0; text-align: right; color: #e4e4e7;">${cohort}</td></tr>
        <tr><td style="padding: 8px 0; color: #71717a;">Expires</td><td style="padding: 8px 0; text-align: right; color: #e4e4e7;">${subscribedUntil.split('T')[0]}</td></tr>
    </table>
    <p style="font-size: 10px; color: #3f3f46; text-align: center; margin: 20px 0 0 0;">Check beta_applications in Firebase for full details.</p>
</div>`,
                });
            }
        } catch (emailErr) {
            // Don't fail the signup if email fails
            console.error('Beta apply notification email failed:', emailErr);
        }

        return Response.json({
            success: true,
            message: 'You\'re in. 30 days of unlimited access.',
            subscription: {
                plan: 'archangel',
                subscribedAt,
                subscribedUntil,
            },
        });
    } catch (error: any) {
        console.error('Beta Apply Error:', error);
        return Response.json(
            { error: error.message || 'Failed to apply.' },
            { status: 500 }
        );
    }
}
