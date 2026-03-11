import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';

export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const country = req.headers.get('x-vercel-ip-country') || "";
        const subRegion = req.headers.get('x-vercel-ip-country-region') || "";
        const region = country && subRegion ? `${country}-${subRegion}` : country || "LOCAL";

        // We only want to set the region if the user document exists, or merge it.
        // The safest approach is a merge set so we don't accidentally overwrite data.
        await db.collection('users').doc(uid).set({ region: region }, { merge: true });

        return Response.json({ success: true, region: region });

    } catch (error: any) {
        console.error("Region Sync API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}
