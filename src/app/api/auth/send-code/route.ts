import twilio from "twilio";
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
);

const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;

// 5 SMS requests per 15 minutes per IP
const SEND_CODE_LIMIT = { maxRequests: 5, windowMs: 15 * 60 * 1000 };

/**
 * Verify a Cloudflare Turnstile token server-side.
 * Returns true if the token is valid, false otherwise.
 */
async function verifyTurnstileToken(token: string, ip: string): Promise<boolean> {
    if (!TURNSTILE_SECRET_KEY) {
        console.warn('[send-code] TURNSTILE_SECRET_KEY not set — skipping Turnstile verification');
        return true; // Allow in dev/staging when key isn't configured
    }

    try {
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                secret: TURNSTILE_SECRET_KEY,
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
        // Rate limit by IP before doing anything
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const rl = checkRateLimit(`send-code-ip:${ip}`, SEND_CODE_LIMIT);
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { phone, channel, turnstileToken } = await req.json();

        // Verify Turnstile token (bot protection)
        if (TURNSTILE_SECRET_KEY) {
            if (!turnstileToken) {
                return Response.json({ error: "Security verification required." }, { status: 403 });
            }
            const isHuman = await verifyTurnstileToken(turnstileToken, ip);
            if (!isHuman) {
                console.warn('[send-code] Turnstile verification failed for IP:', ip);
                return Response.json({ error: "Security verification failed. Please refresh and try again." }, { status: 403 });
            }
        }

        if (!phone) {
            return Response.json({ error: "Phone number is required." }, { status: 400 });
        }

        // Check for test numbers
        if ((phone.startsWith('+100000000') || phone.startsWith('+110000000')) && phone.length === 12) {
            return Response.json({ success: true, channel: 'sms', isTestAccount: true });
        }

        // Support SMS (default) and WhatsApp OTP channels
        const verifyChannel = channel === 'whatsapp' ? 'whatsapp' : 'sms';

        await client.verify.v2
            .services(VERIFY_SERVICE_SID)
            .verifications.create({ to: phone, channel: verifyChannel });

        return Response.json({ success: true, channel: verifyChannel });
    } catch (error: any) {
        console.error("Send Code Error:", error);

        // Twilio-specific error handling
        if (error.code === 60203) {
            return Response.json(
                { error: "Too many attempts. Please try again later." },
                { status: 429 }
            );
        }
        if (error.code === 60200) {
            return Response.json(
                { error: "Invalid phone number." },
                { status: 400 }
            );
        }
        // Channel not configured (e.g. WhatsApp not enabled in Twilio)
        if (error.code === 60205 || error.code === 60207) {
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
