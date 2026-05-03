import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'breadstand@gmail.com';

export async function GET(req: Request) {
    // Verify cron secret (Vercel sends Authorization: Bearer <CRON_SECRET>)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // ── Gather Metrics ────────────────────────────────────────
        const usersSnapshot = await db.collection('users').get();
        const allUsers = usersSnapshot.docs;
        const totalUsers = allUsers.length;

        let newSignups = 0;
        let activeSubscriptions = 0;
        let canceledLast24h = 0;
        let paidLast24h = 0;

        for (const userDoc of allUsers) {
            const data = userDoc.data();

            // User creation may be stored as `createdAt` (camelCase) or `created_at` (snake_case)
            const rawCreated = data?.createdAt || data?.created_at;
            const createdAt = rawCreated?.toDate?.() || (rawCreated ? new Date(rawCreated) : null);
            if (createdAt && createdAt > yesterday) {
                newSignups++;
            }

            const sub = data?.subscription;
            if (sub) {
                if (sub.status === 'active' && sub.subscribedUntil && new Date(sub.subscribedUntil) > now) {
                    activeSubscriptions++;
                }
                if (sub.subscribedAt && new Date(sub.subscribedAt) > yesterday) {
                    paidLast24h++;
                }
                if (sub.canceledAt && new Date(sub.canceledAt) > yesterday) {
                    canceledLast24h++;
                }
            }
        }

        // Posts created in last 24h
        const postsSnapshot = await db.collection('posts')
            .where('created_at', '>=', yesterday)
            .get();
        const postsCreated = postsSnapshot.size;

        // Funnel metrics — unique visitors, landing views, logins
        // Read only yesterday's funnel doc (the cron runs at 8am UTC, so
        // yesterday is the complete 24h window we care about).
        const yesterdayDateStr = yesterday.toLocaleDateString('en-CA'); // YYYY-MM-DD
        const funnelDoc = await db.collection('funnel').doc(yesterdayDateStr).get();
        const funnelData = funnelDoc.exists ? funnelDoc.data() : null;
        const uniqueVisitors = funnelData?.unique_visitors || 0;
        const landingViews = funnelData?.landing_views || 0;
        const funnelLogins = funnelData?.logins || 0;
        const landingPct = uniqueVisitors > 0 ? Math.round((landingViews / uniqueVisitors) * 100) : 0;
        const loginPct = landingViews > 0 ? Math.round((funnelLogins / landingViews) * 100) : 0;

        // Active sessions in last 24h (from already-fetched user data)
        let activeSessions = 0;
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const todayStr = now.toISOString().split('T')[0];
        for (const userDoc of allUsers) {
            const data = userDoc.data();
            const sessionDate = data?.sessions_today_date;
            if ((sessionDate === yesterdayStr || sessionDate === todayStr)
                && (data?.sessions_today || 0) > 0) {
                activeSessions++;
            }
        }

        // ── Format Report ─────────────────────────────────────────
        const dateStr = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

        const htmlReport = `
<div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #d4d4d8; border-radius: 12px;">
    <h1 style="font-size: 14px; text-transform: uppercase; letter-spacing: 0.15em; color: #71717a; margin: 0 0 24px 0;">Earnest Page — Daily Report</h1>
    <p style="font-size: 12px; color: #52525b; margin: 0 0 24px 0;">${dateStr}</p>

    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr style="border-bottom: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #a1a1aa;">Total Users</td>
            <td style="padding: 10px 0; text-align: right; color: #fff; font-weight: 600;">${totalUsers}</td>
        </tr>
        <tr style="border-bottom: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #a1a1aa;">New Users (24h)</td>
            <td style="padding: 10px 0; text-align: right; color: #34d399; font-weight: 600;">${newSignups}</td>
        </tr>
        <tr style="border-bottom: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #a1a1aa;">Active Subscriptions</td>
            <td style="padding: 10px 0; text-align: right; color: #fff; font-weight: 600;">${activeSubscriptions}</td>
        </tr>
        <tr style="border-bottom: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #a1a1aa;">New Payments (24h)</td>
            <td style="padding: 10px 0; text-align: right; color: #34d399; font-weight: 600;">${paidLast24h}</td>
        </tr>
        <tr style="border-bottom: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #a1a1aa;">Cancellations (24h)</td>
            <td style="padding: 10px 0; text-align: right; color: #f87171; font-weight: 600;">${canceledLast24h}</td>
        </tr>
        <tr style="border-bottom: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #a1a1aa;">Active Sessions (24h)</td>
            <td style="padding: 10px 0; text-align: right; color: #fff; font-weight: 600;">${activeSessions}</td>
        </tr>
        <tr style="border-bottom: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #a1a1aa;">Posts Created (24h)</td>
            <td style="padding: 10px 0; text-align: right; color: #fff; font-weight: 600;">${postsCreated}</td>
        </tr>
    </table>

    <div style="margin: 20px 0 0 0; padding: 16px; border: 1px solid #27272a; border-radius: 10px;">
        <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #71717a; margin: 0 0 12px 0;">Visitor Funnel (24h)</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr style="border-bottom: 1px solid #27272a;">
                <td style="padding: 8px 0; color: #a1a1aa;">Unique Visitors</td>
                <td style="padding: 8px 0; text-align: right; color: #60a5fa; font-weight: 600;">${uniqueVisitors}</td>
            </tr>
            <tr style="border-bottom: 1px solid #27272a;">
                <td style="padding: 8px 0; color: #a1a1aa;">Landing Page Views</td>
                <td style="padding: 8px 0; text-align: right; color: #60a5fa; font-weight: 600;">${landingViews} <span style="color: #52525b; font-size: 11px;">(${landingPct}%)</span></td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #a1a1aa;">Logins</td>
                <td style="padding: 8px 0; text-align: right; color: #34d399; font-weight: 600;">${funnelLogins} <span style="color: #52525b; font-size: 11px;">(${loginPct}% of landing)</span></td>
            </tr>
        </table>
    </div>

    <p style="font-size: 10px; color: #3f3f46; text-transform: uppercase; letter-spacing: 0.2em; text-align: center; margin: 24px 0 0 0;">Automated Report — Earnest Page</p>
</div>`;

        // ── Send Email via Gmail ──────────────────────────────────
        if (!process.env.GMAIL_APP_PASSWORD) {
            console.warn('[Daily Report] GMAIL_APP_PASSWORD not set. Logging report to console.');
            console.log('[Daily Report]', {
                totalUsers, newSignups, activeSubscriptions, paidLast24h,
                canceledLast24h, activeSessions, postsCreated, uniqueVisitors, landingViews, funnelLogins,
            });
            return NextResponse.json({
                success: true,
                warning: 'GMAIL_APP_PASSWORD not configured. Report logged to console.',
                metrics: { totalUsers, newSignups, activeSubscriptions, paidLast24h, canceledLast24h, activeSessions, postsCreated, uniqueVisitors, landingViews, funnelLogins },
            });
        }

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
            subject: `📊 Daily Report — ${newSignups} new · ${uniqueVisitors} visitors · ${funnelLogins} logins · ${postsCreated} posts`,
            html: htmlReport,
        });

        console.log('[Daily Report] Sent successfully.');

        return NextResponse.json({
            success: true,
            metrics: { totalUsers, newSignups, activeSubscriptions, paidLast24h, canceledLast24h, activeSessions, postsCreated, uniqueVisitors, landingViews, funnelLogins },
        });

    } catch (error: any) {
        console.error('[Daily Report] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
