import '@/lib/firebase/admin'; // Ensure Admin SDK is initialized before getAuth()
import { getAuth } from 'firebase-admin/auth';

/**
 * Verifies the Firebase ID token from the Authorization header.
 * Returns the authenticated UID, or null if invalid/missing.
 */
export async function verifyAuth(req: Request): Promise<string | null> {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decoded = await getAuth().verifyIdToken(idToken);
        return decoded.uid;
    } catch {
        return null;
    }
}

/**
 * Verifies internal server-to-server calls using CRON_SECRET.
 * Used by compile, avatar, dossier routes which are only called from other API routes.
 */
export function verifyInternalAuth(req: Request): boolean {
    const key = req.headers.get('x-internal-key');
    return !!process.env.CRON_SECRET && key === process.env.CRON_SECRET;
}

/**
 * Returns an Unauthorized JSON response.
 */
export function unauthorizedResponse() {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
