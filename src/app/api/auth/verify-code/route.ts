import twilio from "twilio";
import { getAuth } from "firebase-admin/auth";
import "@/lib/firebase/admin"; // Ensure admin is initialized

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
);

const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID!;

export async function POST(req: Request) {
    try {
        const { phone, code } = await req.json();

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
        } catch {
            // User doesn't exist — create them
            const newUser = await adminAuth.createUser({ phoneNumber: phone });
            uid = newUser.uid;
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
