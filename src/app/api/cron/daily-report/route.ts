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

        // Guest sessions in last 24h
        const guestSessionsSnapshot = await db.collection('guest_sessions')
            .where('lastActivity', '>=', yesterday)
            .get();
        const guestSessions = guestSessionsSnapshot.size;

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

        // ── Beta Tester Engagement ─────────────────────────────────
        interface BetaTesterRow {
            name: string;
            tiktok: string;
            cohort: string;
            sessions: number;
            postCount: number;
            lastActive: string;
            daysLeft: number;
            inactive: boolean;
        }

        const betaTesters: BetaTesterRow[] = [];
        const betaTesterUids: string[] = [];

        for (const userDoc of allUsers) {
            const data = userDoc.data();
            if (data?.beta_tester) {
                betaTesterUids.push(userDoc.id);
                const bt = data.beta_tester;
                const sub = data.subscription;
                const subEnd = sub?.subscribedUntil || sub?.currentPeriodEnd;
                const daysLeft = subEnd ? Math.max(0, Math.ceil((new Date(subEnd).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))) : 0;

                // Determine last active date
                const lastSessionDate = data.sessions_today_date || '';
                const lastUpdated = data.updatedAt?.toDate?.()?.toISOString?.()?.split('T')[0]
                    || (data.updatedAt ? new Date(data.updatedAt).toISOString().split('T')[0] : '');
                const lastActive = lastSessionDate || lastUpdated || 'never';

                // Check if inactive 3+ days
                let inactive = true;
                if (lastActive && lastActive !== 'never') {
                    const daysSince = Math.floor((now.getTime() - new Date(lastActive).getTime()) / (24 * 60 * 60 * 1000));
                    inactive = daysSince >= 3;
                }

                betaTesters.push({
                    name: bt.name || '—',
                    tiktok: bt.tiktok_handle || '—',
                    cohort: bt.cohort || '—',
                    sessions: data.identity?.session_count || 0,
                    postCount: 0, // filled below
                    lastActive,
                    daysLeft,
                    inactive,
                });
            }
        }

        // Fetch post counts for beta testers
        for (let i = 0; i < betaTesterUids.length; i++) {
            const postsSnap = await db.collection('posts')
                .where('authorId', '==', betaTesterUids[i])
                .get();
            betaTesters[i].postCount = postsSnap.size;
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
        <tr style="border-bottom: 1px solid #27272a;">
            <td style="padding: 10px 0; color: #a1a1aa;">Guest Sessions (24h)</td>
            <td style="padding: 10px 0; text-align: right; color: #60a5fa; font-weight: 600;">${guestSessions}</td>
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

    ${betaTesters.length > 0 ? `
    <div style="margin: 20px 0 0 0; padding: 16px; border: 1px solid #27272a; border-radius: 10px;">
        <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #71717a; margin: 0 0 12px 0;">Beta Testers (${betaTesters.length})</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <tr style="border-bottom: 1px solid #27272a;">
                <td style="padding: 6px 4px; color: #52525b; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;">Name</td>
                <td style="padding: 6px 4px; color: #52525b; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;">TikTok</td>
                <td style="padding: 6px 4px; color: #52525b; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; text-align: center;">Sessions</td>
                <td style="padding: 6px 4px; color: #52525b; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; text-align: center;">Posts</td>
                <td style="padding: 6px 4px; color: #52525b; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; text-align: center;">Payout</td>
                <td style="padding: 6px 4px; color: #52525b; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; text-align: center;">Last Active</td>
                <td style="padding: 6px 4px; color: #52525b; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; text-align: center;">Days Left</td>
            </tr>
            ${betaTesters.map(bt => {
                // Payout milestones: $50 at 1 post, $50 at 3 posts
                let payout = '';
                if (bt.postCount >= 3) payout = '\u2705 $100 done';
                else if (bt.postCount >= 1) payout = '\u2705 $50 · <span style="color: #fbbf24;">$50 at 3 posts</span>';
                else payout = '<span style="color: #52525b;">$50 at 1st post</span>';
                return `
            <tr style="border-bottom: 1px solid #18181b;">
                <td style="padding: 8px 4px; color: ${bt.inactive ? '#f87171' : '#d4d4d8'}; font-weight: 500;">${bt.inactive ? '\u26a0\ufe0f ' : ''}${bt.name}</td>
                <td style="padding: 8px 4px; color: #a1a1aa;">${bt.tiktok}</td>
                <td style="padding: 8px 4px; color: ${bt.sessions > 0 ? '#34d399' : '#52525b'}; font-weight: 600; text-align: center;">${bt.sessions}</td>
                <td style="padding: 8px 4px; color: ${bt.postCount > 0 ? '#34d399' : '#52525b'}; font-weight: 600; text-align: center;">${bt.postCount}</td>
                <td style="padding: 8px 4px; text-align: center; font-size: 11px;">${payout}</td>
                <td style="padding: 8px 4px; color: ${bt.inactive ? '#f87171' : '#a1a1aa'}; text-align: center; font-size: 11px;">${bt.lastActive}</td>
                <td style="padding: 8px 4px; color: ${bt.daysLeft <= 5 ? '#fbbf24' : '#a1a1aa'}; font-weight: 600; text-align: center;">${bt.daysLeft}d</td>
            </tr>`;
            }).join('')}
        </table>
    </div>
    ` : ''}

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
                metrics: { totalUsers, newSignups, activeSubscriptions, paidLast24h, canceledLast24h, activeSessions, postsCreated, guestSessions, uniqueVisitors, landingViews, funnelLogins },
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
            subject: `📊 Daily Report — ${newSignups} new · ${uniqueVisitors} visitors · ${guestSessions} guest chats · ${funnelLogins} logins · ${postsCreated} posts`,
            html: htmlReport,
        });

        console.log('[Daily Report] Sent successfully.');

        return NextResponse.json({
            success: true,
            metrics: { totalUsers, newSignups, activeSubscriptions, paidLast24h, canceledLast24h, activeSessions, postsCreated, guestSessions, uniqueVisitors, landingViews, funnelLogins },
        });

    } catch (error: any) {
        console.error('[Daily Report] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
