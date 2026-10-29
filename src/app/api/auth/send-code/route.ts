import twilio from "twilio";
import { db } from '@/lib/firebase/admin';

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
);

const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;

// ── Phone validation ───────────────────────────────────────────────
// SMS pumping profits from texts to premium-rate international and
// Caribbean (+1 but not US/CA) numbers. Only US and Canadian numbers
// are allowed, so pumped numbers never reach Twilio.

// NANP area codes outside the US and Canada.
const BLOCKED_NANP_AREA_CODES = new Set([
    '242', '246', '264', '268', '284', '345', '441', '473', '649', '658',
    '664', '721', '758', '767', '784', '809', '829', '849', '868', '869', '876',
]);

/** Returns the E.164 number for a valid US/CA phone, or null. */
function normalizeUsCaPhone(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 10) digits = '1' + digits;
    if (digits.length !== 11 || !digits.startsWith('1')) return null;

    const areaCode = digits.slice(1, 4);
    const exchange = digits.slice(4, 7);
    // NANP: area code and exchange both start with 2-9
    if (!/^[2-9]/.test(areaCode) || !/^[2-9]/.test(exchange)) return null;
    if (BLOCKED_NANP_AREA_CODES.has(areaCode)) return null;

    return '+' + digits;
}

function isTestNumber(phone: string): boolean {
    return (phone.startsWith('+100000000') || phone.startsWith('+110000000')) && phone.length === 12;
}

// ── Rate limiting ──────────────────────────────────────────────────
// Stored in Firestore so limits hold across every serverless instance
// and cold start (the in-memory limiter did not). The global cap is the
// hard ceiling on SMS spend per hour.

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const PHONE_LIMIT = Number(process.env.SMS_PHONE_HOURLY_LIMIT) || 3;
const IP_LIMIT = Number(process.env.SMS_IP_HOURLY_LIMIT) || 5;
const GLOBAL_LIMIT = Number(process.env.SMS_GLOBAL_HOURLY_LIMIT) || 60;

async function checkSmsRateLimits(phone: string, ip: string): Promise<{ limited: boolean; reason?: string }> {
    const rateLimits = db.collection('sms_rate_limits');
    const buckets = [
        { ref: rateLimits.doc(`phone_${phone}`), limit: PHONE_LIMIT, label: `phone ${phone}` },
        { ref: rateLimits.doc(`ip_${encodeURIComponent(ip)}`), limit: IP_LIMIT, label: `IP ${ip}` },
        { ref: rateLimits.doc('global'), limit: GLOBAL_LIMIT, label: 'global' },
    ];

    return db.runTransaction(async (tx) => {
        const now = Date.now();
        const cutoff = now - WINDOW_MS;
        const snaps = await Promise.all(buckets.map(b => tx.get(b.ref)));
        const timestamps = snaps.map(s => ((s.data()?.ts as number[] | undefined) || []).filter(t => t > cutoff));

        for (let i = 0; i < buckets.length; i++) {
            if (timestamps[i].length >= buckets[i].limit) {
                return { limited: true, reason: `${buckets[i].label} exceeded ${buckets[i].limit}/hour` };
            }
        }

        // Record this send against every bucket
        buckets.forEach((b, i) => tx.set(b.ref, { ts: [...timestamps[i], now], updated_at: now }));
        return { limited: false };
    });
}

// ── Turnstile ──────────────────────────────────────────────────────

/**
 * Verify a Cloudflare Turnstile token server-side.
 * Returns true if the token is valid, false otherwise.
 */
async function verifyTurnstileToken(secret: string, token: string, ip: string): Promise<boolean> {
    try {
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                secret,
                response: token,
                remoteip: ip,
            }),
        });
        const data = await res.json();
        return data.success === true;
    } catch (err) {
        console.error('[send-code] Turnstile verification error:', err);
        return false;
    }
}

export async function POST(req: Request) {
    try {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const { phone, channel, turnstileToken } = await req.json();

        if (!phone) {
            return Response.json({ error: "Phone number is required." }, { status: 400 });
        }

        // Only US/CA numbers (free check, stops pumped numbers outright)
        const testAccount = typeof phone === 'string' && isTestNumber(phone);
        const to = testAccount ? phone : normalizeUsCaPhone(phone);
        if (!to) {
            console.warn(`[send-code] Rejected non-US/CA number from IP ${ip}: ${String(phone).slice(0, 6)}…`);
            return Response.json({ error: "Please enter a valid US or Canadian phone number." }, { status: 400 });
        }

        // Verify Turnstile token (bot protection). Fail closed in production if not configured.
        const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
        if (!turnstileSecret) {
            if (process.env.VERCEL_ENV === 'production') {
                console.error('[send-code] TURNSTILE_SECRET_KEY not set in production — refusing to send SMS');
                return Response.json({ error: "Failed to send verification code." }, { status: 503 });
            }
            console.warn('[send-code] TURNSTILE_SECRET_KEY not set — skipping Turnstile verification');
        } else {
            if (!turnstileToken) {
                return Response.json({ error: "Security verification required." }, { status: 403 });
            }
            const isHuman = await verifyTurnstileToken(turnstileSecret, turnstileToken, ip);
            if (!isHuman) {
                console.warn('[send-code] Turnstile verification failed for IP:', ip);
                return Response.json({ error: "Security verification failed. Please refresh and try again." }, { status: 403 });
            }
        }

        if (testAccount) {
            return Response.json({ success: true, channel: 'sms', isTestAccount: true });
        }

        // Durable per-phone, per-IP and global limits. After Turnstile so
        // failed bot attempts can't burn the global budget.
        const rateCheck = await checkSmsRateLimits(to, ip);
        if (rateCheck.limited) {
            console.warn(`[send-code] Rate limited: ${rateCheck.reason}`);
            return Response.json(
                { error: "Too many requests. Please try again later." },
                { status: 429, headers: { 'Retry-After': '3600' } }
            );
        }

        // Support SMS (default) and WhatsApp OTP channels
        const verifyChannel = channel === 'whatsapp' ? 'whatsapp' : 'sms';

        await client.verify.v2
            .services(VERIFY_SERVICE_SID)
            .verifications.create({ to, channel: verifyChannel });

        return Response.json({ success: true, channel: verifyChannel });
    } catch (error) {
        console.error("Send Code Error:", error);
        const code = (error as { code?: number } | null)?.code;

        // Twilio-specific error handling
        if (code === 60203) {
            return Response.json(
                { error: "Too many attempts. Please try again later." },
                { status: 429 }
            );
        }
        if (code === 60200) {
            return Response.json(
                { error: "Invalid phone number." },
                { status: 400 }
            );
        }
        // Channel not configured (e.g. WhatsApp not enabled in Twilio)
        if (code === 60205 || code === 60207) {
            return Response.json(
                { error: "This verification method is not available. Please try SMS." },
                { status: 400 }
            );
        }

        return Response.json(
            { error: "Failed to send verification code." },
            { status: 500 }
        );
    }
}
