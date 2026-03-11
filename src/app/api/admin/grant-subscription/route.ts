import { db } from '@/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';

const ADMIN_KEY = process.env.ADMIN_SECRET_KEY;

const VALID_PLANS = ['proving_ground', 'long_game'] as const;

export async function POST(req: Request) {
    try {
        // 1. Verify admin key
        const adminKey = req.headers.get('x-admin-key');
        if (!ADMIN_KEY || adminKey !== ADMIN_KEY) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { phone, plan = 'long_game' } = body;

        if (!phone) {
            return Response.json(
                { error: 'Phone number is required.' },
                { status: 400 }
            );
        }

        if (!VALID_PLANS.includes(plan)) {
            return Response.json(
                { error: `Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}` },
                { status: 400 }
            );
        }

        // 2. Look up the user by phone number
        let uid: string;
        try {
            const userRecord = await getAuth().getUserByPhoneNumber(phone);
            uid = userRecord.uid;
        } catch {
            return Response.json(
                { error: `No user found with phone number: ${phone}` },
                { status: 404 }
            );
        }

        // 3. Grant the subscription
        const now = new Date();
        const expiry = new Date(now);

        if (plan === 'proving_ground') {
            expiry.setDate(expiry.getDate() + 30);
        } else {
            // long_game: 1 year
            expiry.setFullYear(expiry.getFullYear() + 1);
        }

        const subscribedUntil = expiry.toISOString();

        await db.collection('users').doc(uid).set(
            {
                subscription: {
                    status: 'active',
                    plan,
                    grantedBy: 'admin',
                    grantedAt: now.toISOString(),
                    subscribedAt: now.toISOString(),
                    subscribedUntil,
                },
            },
            { merge: true }
        );

        return Response.json({
            success: true,
            uid,
            phone,
            plan,
            message: `Subscription granted: ${plan}`,
        });
    } catch (error: any) {
        console.error('Admin Grant Subscription Error:', error);
        return Response.json(
            { error: error.message || 'An unexpected error occurred.' },
            { status: 500 }
        );
    }
}
