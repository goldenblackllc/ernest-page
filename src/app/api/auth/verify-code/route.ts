import twilio from "twilio";
import { getAuth } from "firebase-admin/auth";
import "@/lib/firebase/admin"; // Ensure admin is initialized
import { db } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
);

const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;

// 10 verification attempts per 15 minutes per IP
const VERIFY_CODE_LIMIT = { maxRequests: 10, windowMs: 15 * 60 * 1000 };

export async function POST(req: Request) {
    try {
        // Rate limit by IP before doing anything
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        const rl = checkRateLimit(`verify-code-ip:${ip}`, VERIFY_CODE_LIMIT);
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const body = await req.json();
        // Strip to only + and digits — invisible Unicode chars were causing "Invalid format"
        const phone = (body.phone || '').replace(/[^\d+]/g, '');
        const code = body.code || '';

        if (!phone || !code) {
            return Response.json({ error: "Phone and code are required." }, { status: 400 });
        }

        // 1. Verify the code with Twilio or handle test accounts
        if ((phone.startsWith('+100000000') || phone.startsWith('+110000000')) && phone.length === 12) {
            if (code !== '000000') {
                return Response.json({ error: "Invalid test code." }, { status: 401 });
            }
        } else {
            const check = await client.verify.v2
                .services(VERIFY_SERVICE_SID)
                .verificationChecks.create({ to: phone, code });

            if (check.status !== "approved") {
                return Response.json({ error: "Invalid code. Please try again." }, { status: 401 });
            }
        }

        // 2. Find or create the Firebase user
        const adminAuth = getAuth();
        let uid: string;

        try {
            const existingUser = await adminAuth.getUserByPhoneNumber(phone);
            uid = existingUser.uid;
        } catch (lookupError) {
            // Only create user if the error is specifically "user not found"
            if ((lookupError as { code?: string } | null)?.code === 'auth/user-not-found') {
                try {
                    console.log('[verify-code] Creating new user');
                    const newUser = await adminAuth.createUser({ phoneNumber: phone });
                    uid = newUser.uid;

                    // created_at starts the user's free-session year (sessionAccess.ts)
                    await db.collection('users').doc(newUser.uid).set({
                        created_at: new Date().toISOString(),
                    }, { merge: true });
                } catch (createError) {
                    const err = createError as { code?: string; message?: string; errorInfo?: unknown } | null;
                    console.error('[verify-code] createUser failed:', err?.code, err?.message, JSON.stringify(err?.errorInfo));
                    throw createError;
                }
            } else {
                console.error('[verify-code] getUserByPhoneNumber failed:', lookupError);
                throw lookupError;
            }
        }

        // 3. Create a custom token for the client to sign in
        const customToken = await adminAuth.createCustomToken(uid);

        return Response.json({ success: true, token: customToken });
    } catch (error) {
        console.error("Verify Code Error:", error);

        if ((error as { code?: number } | null)?.code === 60202) {
            return Response.json(
                { error: "Too many attempts. Please request a new code." },
                { status: 429 }
            );
        }

        return Response.json(
            { error: "Verification failed. Please try again." },
            { status: 500 }
        );
    }
}
