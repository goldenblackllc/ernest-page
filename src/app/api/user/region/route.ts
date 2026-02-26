import { db } from '@/lib/firebase/admin';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const uid = body.uid;
        const region = req.headers.get('x-vercel-ip-country-region') || "LOCAL";

        if (!uid) {
            return Response.json({ error: "UID is required to sync region." }, { status: 400 });
        }

        // We only want to set the region if the user document exists, or merge it.
        // The safest approach is a merge set so we don't accidentally overwrite data.
        await db.collection('users').doc(uid).set({ region: region }, { merge: true });

        return Response.json({ success: true, region: region });

    } catch (error: any) {
        console.error("Region Sync API Error:", error);
        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}
