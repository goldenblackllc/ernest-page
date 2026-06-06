import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { nanoid } from 'nanoid';

const ADMIN_UID = process.env.ADMIN_UID;

/**
 * POST /api/beta/create
 * Admin-only endpoint to generate beta invite codes.
 * Each code grants a 30-day Archangel subscription + beta tester tagging on redemption.
 *
 * Body: { count?: number, cohort?: string, tiktok_handle?: string, name?: string, source?: string }
 *
 * - count: 1–20 codes to generate (default 1)
 * - cohort: campaign identifier (default "tiktok-june-2026")
 * - tiktok_handle / name: optional metadata attached to the invite
 * - source: platform source (default "tiktok")
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        // Admin-only
        if (!ADMIN_UID || uid !== ADMIN_UID) {
            return Response.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
        }

        const body = await req.json();
        const {
            count = 1,
            cohort = 'tiktok-june-2026',
            tiktok_handle,
            name,
            source = 'tiktok',
        } = body;

        const batchSize = Math.min(Math.max(count, 1), 20);
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://earnestpage.com';
        const invites: { code: string; url: string }[] = [];

        for (let i = 0; i < batchSize; i++) {
            const code = nanoid(12);
            await db.collection('beta_invites').doc(code).set({
                code,
                createdAt: new Date().toISOString(),
                createdBy: uid,
                cohort,
                source,
                status: 'pending',
                recipientUid: null,
                redeemedAt: null,
                ...(tiktok_handle ? { tiktok_handle } : {}),
                ...(name ? { name } : {}),
            });
            invites.push({ code, url: `${baseUrl}/beta/${code}` });
        }

        console.log(`Beta invite: ${batchSize} code(s) created by ${uid} [cohort: ${cohort}]`);

        return Response.json(
            batchSize === 1
                ? invites[0]
                : { invites, count: batchSize }
        );
    } catch (error: any) {
        console.error('Beta Create Error:', error);
        return Response.json(
            { error: error.message || 'Failed to create beta invite.' },
            { status: 500 }
        );
    }
}
