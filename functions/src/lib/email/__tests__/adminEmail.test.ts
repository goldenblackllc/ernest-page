// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { sendMail, createTransport } = vi.hoisted(() => {
    const sendMail = vi.fn().mockResolvedValue({});
    const createTransport = vi.fn(() => ({ sendMail }));
    return { sendMail, createTransport };
});

vi.mock('nodemailer', () => ({ default: { createTransport }, createTransport }));

import { buildNewPostEmail, sendAdminEmail, ADMIN_EMAIL, type NewPostEmail } from '../adminEmail.js';

function post(overrides: Partial<NewPostEmail> = {}): NewPostEmail {
    return {
        postId: 'post123',
        author: 'Brave Builder',
        title: 'On courage',
        thumbnailUrl: 'https://img/t.jpg',
        visibility: 'public',
        engagementVerified: true,
        userTurns: 5,
        avgLength: 120,
        durationMin: 14,
        closeReasonLabel: 'Natural close',
        pendingImages: 3,
        ...overrides,
    };
}

describe('buildNewPostEmail', () => {
    it('includes the author, title and metrics', () => {
        const { subject, html } = buildNewPostEmail(post());
        expect(subject).toContain('Brave Builder');
        expect(html).toContain('Brave Builder');
        expect(html).toContain('On courage');
        expect(html).toContain('5 user messages');
        expect(html).toContain('3 pending');
        expect(html).toContain('post123');
    });

    it('escapes HTML in the author', () => {
        const { html } = buildNewPostEmail(post({ author: '<script>alert(1)</script>' }));
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapes HTML in the title', () => {
        const { html } = buildNewPostEmail(post({ title: '<img src=x onerror=alert(1)>' }));
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('cannot break out of the thumbnail src attribute', () => {
        const { html } = buildNewPostEmail(post({ thumbnailUrl: 'x" onerror="alert(1)' }));
        expect(html).not.toContain('" onerror="');
        expect(html).toContain('src="x&quot; onerror=&quot;alert(1)"');
    });

    it('escapes the close reason label and visibility', () => {
        const { html } = buildNewPostEmail(post({ closeReasonLabel: '<b>x</b>', visibility: '<i>v</i>' }));
        expect(html).not.toContain('<b>x</b>');
        expect(html).not.toContain('<i>v</i>');
    });

    it('omits the title and thumbnail when missing', () => {
        const { html } = buildNewPostEmail(post({ title: null, thumbnailUrl: null }));
        expect(html).not.toContain('font-style: italic');
        expect(html).not.toContain('<img');
    });

    it('labels low engagement', () => {
        const { subject, html } = buildNewPostEmail(post({ engagementVerified: false }));
        expect(subject).toContain('LOW ENGAGEMENT');
        expect(html).toContain('LOW ENGAGEMENT');
    });
});

describe('sendAdminEmail', () => {
    const original = process.env.GMAIL_APP_PASSWORD;
    beforeEach(() => {
        sendMail.mockClear();
        createTransport.mockClear();
    });
    afterEach(() => {
        if (original === undefined) delete process.env.GMAIL_APP_PASSWORD;
        else process.env.GMAIL_APP_PASSWORD = original;
    });

    it('returns false and sends nothing without a password', async () => {
        delete process.env.GMAIL_APP_PASSWORD;
        await expect(sendAdminEmail('s', '<p>h</p>')).resolves.toBe(false);
        expect(createTransport).not.toHaveBeenCalled();
        expect(sendMail).not.toHaveBeenCalled();
    });

    it('sends to the admin and returns true with a password', async () => {
        process.env.GMAIL_APP_PASSWORD = 'test-app-password';
        await expect(sendAdminEmail('Subject', '<p>Body</p>')).resolves.toBe(true);
        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
            to: ADMIN_EMAIL,
            subject: 'Subject',
            html: '<p>Body</p>',
        }));
    });
});
