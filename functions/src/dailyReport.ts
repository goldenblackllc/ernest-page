/**
 * Daily admin report — emails platform metrics at 8:00 AM UTC.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import nodemailer from 'nodemailer';
import { db } from './lib/firebase/admin.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'breadstand@gmail.com';

export const dailyReport = onSchedule(
    {
        schedule: '0 8 * * *',
        timeZone: 'UTC',
        region: 'us-central1',
        timeoutSeconds: 300,
        memory: '512MiB',
    },
    async () => {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // ── Gather Metrics ────────────────────────────────────────
        const usersSnapshot = await db.collection('users').get();
        const totalUsers = usersSnapshot.size;

        let newSignups = 0;
        for (const userDoc of usersSnapshot.docs) {
            const data = userDoc.data();
            // User creation may be stored as `createdAt` (camelCase) or `created_at` (snake_case)
            const rawCreated = data?.createdAt || data?.created_at;
            const createdAt = rawCreated?.toDate?.() || (rawCreated ? new Date(rawCreated) : null);
            if (createdAt && createdAt > yesterday) newSignups++;
        }

        const postsSnapshot = await db.collection('posts')
            .where('created_at', '>=', yesterday)
            .get();
        const postsCreated = postsSnapshot.size;

        // Funnel metrics — yesterday's doc is the complete 24h window at 8 AM UTC
        const yesterdayDateStr = yesterday.toLocaleDateString('en-CA'); // YYYY-MM-DD
        const funnelDoc = await db.collection('funnel').doc(yesterdayDateStr).get();
        const funnelData = funnelDoc.exists ? funnelDoc.data() : null;
        const landingViews = funnelData?.landing_views || 0;
        const funnelLogins = funnelData?.logins || 0;
        const loginPct = landingViews > 0 ? Math.round((funnelLogins / landingViews) * 100) : 0;

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
            <td style="padding: 10px 0; color: #a1a1aa;">Posts Created (24h)</td>
            <td style="padding: 10px 0; text-align: right; color: #fff; font-weight: 600;">${postsCreated}</td>
        </tr>
    </table>

    <div style="margin: 20px 0 0 0; padding: 16px; border: 1px solid #27272a; border-radius: 10px;">
        <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #71717a; margin: 0 0 12px 0;">Visitor Funnel (24h)</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr style="border-bottom: 1px solid #27272a;">
                <td style="padding: 8px 0; color: #a1a1aa;">Landing Page Views</td>
                <td style="padding: 8px 0; text-align: right; color: #60a5fa; font-weight: 600;">${landingViews}</td>
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
            console.warn('[Daily Report] GMAIL_APP_PASSWORD not set. Logging report instead.', {
                totalUsers, newSignups, postsCreated, landingViews, funnelLogins,
            });
            return;
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: ADMIN_EMAIL, pass: process.env.GMAIL_APP_PASSWORD },
        });

        await transporter.sendMail({
            from: `Earnest Page <${ADMIN_EMAIL}>`,
            to: ADMIN_EMAIL,
            subject: `Daily Report -- ${funnelLogins} logins, ${newSignups} new`,
            html: htmlReport,
        });

        console.log('[Daily Report] Sent successfully.');
    }
);
