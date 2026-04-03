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

        console.log('[verify-code] Received:', { phone, code, length: phone.length });

        if (!phone || !code) {
            return Response.json({ error: "Phone and code are required." }, { status: 400 });
        }

        // 1. Verify the code with Twilio
        const check = await client.verify.v2
            .services(VERIFY_SERVICE_SID)
            .verificationChecks.create({ to: phone, code });

        if (check.status !== "approved") {
            return Response.json({ error: "Invalid code. Please try again." }, { status: 401 });
        }

        // 2. Find or create the Firebase user
        const adminAuth = getAuth();
        let uid: string;

        try {
            const existingUser = await adminAuth.getUserByPhoneNumber(phone);
            uid = existingUser.uid;
        } catch (lookupError: any) {
            // Only create user if the error is specifically "user not found"
            if (lookupError?.code === 'auth/user-not-found') {
                try {
                    console.log('[verify-code] Creating user with phone:', JSON.stringify(phone), 'length:', phone.length);
                    const newUser = await adminAuth.createUser({ phoneNumber: phone });
                    uid = newUser.uid;

                    // Give new users 1 free session credit
                    await db.collection('users').doc(newUser.uid).set({
                        session_credits: 1,
                        created_at: new Date().toISOString(),
                    }, { merge: true });
                } catch (createError: any) {
                    console.error('[verify-code] createUser failed:', createError?.code, createError?.message, JSON.stringify(createError?.errorInfo));
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
    } catch (error: any) {
        console.error("Verify Code Error:", error);

        if (error.code === 60202) {
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
