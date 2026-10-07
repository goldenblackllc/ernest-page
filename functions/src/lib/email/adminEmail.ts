/**
 * Admin notification emails, sent from and to ADMIN_EMAIL through Gmail.
 */

import nodemailer from 'nodemailer';

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'breadstand@gmail.com';

/**
 * Email the admin. Returns false without sending when GMAIL_APP_PASSWORD is not set.
 */
export async function sendAdminEmail(subject: string, html: string): Promise<boolean> {
    if (!process.env.GMAIL_APP_PASSWORD) return false;

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: ADMIN_EMAIL, pass: process.env.GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
        from: `Earnest Page <${ADMIN_EMAIL}>`,
        to: ADMIN_EMAIL,
        subject,
        html,
    });
    return true;
}

// ─── New post notification ──────────────────────────────────────────────────

export interface NewPostEmail {
    postId: string;
    author: string;
    title: string | null;
    thumbnailUrl: string | null;
    visibility: string;
    /** True when the chat reached its close (condensed transcript's reached_close) */
    engagementVerified: boolean;
    userTurns: number;
    avgLength: number;
    durationMin: number;
    closeReasonLabel: string;
    pendingImages: number;
}

/** Escape text for safe interpolation into HTML content and quoted attributes. */
function escapeHtml(value: unknown): string {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function buildNewPostEmail(post: NewPostEmail): { subject: string; html: string } {
    const engagementLabel = post.engagementVerified ? '✅ VERIFIED' : '⚠️ LOW ENGAGEMENT';
    const engagementColor = post.engagementVerified ? '#34d399' : '#fbbf24';

    return {
        subject: `${engagementLabel} 📝 New Post — ${post.author}`,
        html: `
<div style="font-family: -apple-system, sans-serif; background: #09090b; color: #d4d4d8; padding: 32px; border-radius: 12px; max-width: 480px;">
    <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #71717a; margin: 0 0 16px 0;">New Post Published</p>
    <h2 style="font-size: 20px; color: #ffffff; margin: 0 0 4px 0; font-weight: 700;">${escapeHtml(post.author)}</h2>
    ${post.title ? `<p style="font-size: 14px; color: #a1a1aa; margin: 4px 0 12px 0; font-style: italic;">"${escapeHtml(post.title)}"</p>` : ''}
    <div style="margin: 8px 0 12px 0; padding: 8px 12px; background: ${post.engagementVerified ? '#052e16' : '#422006'}; border: 1px solid ${engagementColor}; border-radius: 8px; font-size: 13px; color: ${engagementColor}; font-weight: 600;">
        ${engagementLabel}
    </div>
    ${post.thumbnailUrl ? `<div style="margin: 0 0 16px 0;"><img src="${escapeHtml(post.thumbnailUrl)}" alt="Post thumbnail" style="width: 100%; border-radius: 8px; display: block;" /></div>` : ''}
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr><td style="padding: 6px 0; color: #71717a;">Visibility</td><td style="padding: 6px 0; text-align: right; color: ${post.visibility === 'private' ? '#f87171' : '#34d399'}; font-weight: 600;">${escapeHtml(post.visibility)}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Exchanges</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7;">${post.userTurns} user messages</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Avg Response</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7;">${post.avgLength} chars</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Duration</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7;">${post.durationMin} min</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Session End</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7;">${escapeHtml(post.closeReasonLabel)}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Post ID</td><td style="padding: 6px 0; text-align: right; color: #e4e4e7; font-family: monospace; font-size: 11px;">${escapeHtml(post.postId)}</td></tr>
        <tr><td style="padding: 6px 0; color: #71717a;">Images</td><td style="padding: 6px 0; text-align: right; color: #fbbf24; font-weight: 600;">⏳ ${post.pendingImages} pending</td></tr>
    </table>
</div>`,
    };
}
