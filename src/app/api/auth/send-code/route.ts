import twilio from "twilio";
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
);

const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;

// 5 SMS requests per 15 minutes per IP
const SEND_CODE_LIMIT = { maxRequests: 5, windowMs: 15 * 60 * 1000 };

export async function POST(req: Request) {
    try {
        // Rate limit by IP before doing anything
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const rl = checkRateLimit(`send-code-ip:${ip}`, SEND_CODE_LIMIT);
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { phone } = await req.json();

        if (!phone) {
            return Response.json({ error: "Phone number is required." }, { status: 400 });
        }

        await client.verify.v2
            .services(VERIFY_SERVICE_SID)
            .verifications.create({ to: phone, channel: "sms" });

        return Response.json({ success: true });
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

        return Response.json(
            { error: "Failed to send verification code." },
            { status: 500 }
        );
    }
}
