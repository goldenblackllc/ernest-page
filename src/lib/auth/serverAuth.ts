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
 * Returns an Unauthorized JSON response.
 */
export function unauthorizedResponse() {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
