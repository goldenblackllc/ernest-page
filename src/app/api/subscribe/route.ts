import { db } from '@/lib/firebase/admin';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { uid, plan, paymentIntentId } = body;

        if (!uid || !plan) {
            return Response.json(
                { error: 'UID and plan are required.' },
                { status: 400 }
            );
        }

        const validPlans = ['executive_retainer', 'founders_key'];
        if (!validPlans.includes(plan)) {
            return Response.json(
                { error: 'Invalid plan.' },
                { status: 400 }
            );
        }

        // Write subscription status to the user's document
        await db.collection('users').doc(uid).set(
            {
                subscription: {
                    status: 'active',
                    plan,
                    paymentIntentId: paymentIntentId || null,
                    subscribedAt: new Date().toISOString(),
                },
            },
            { merge: true }
        );

        return Response.json({ success: true, plan });
    } catch (error: any) {
        console.error('Subscribe API Error:', error);
        return Response.json(
            { error: error.message || 'An unexpected error occurred.' },
            { status: 500 }
        );
    }
}
