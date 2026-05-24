import { verifySSOToken } from '@/lib/sso';
import { getAuth } from 'firebase-admin/auth';
import '@/lib/firebase/admin'; // Ensure admin is initialized
import { db } from '@/lib/firebase/admin';

/**
 * GET /api/auth/sso?token=xxx
 * 
 * Receives a signed SSO token from a sister app, verifies the signature,
 * finds or creates the Firebase user by phone number, mints a custom token,
 * and redirects to the client-side callback page.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return Response.json({ error: 'Missing token' }, { status: 400 });
    }

    // 1. Verify the SSO token (signature, expiry, nonce)
    const payload = verifySSOToken(token);

    console.log(`[sso] Verified token from "${payload.source}" for phone ${payload.phone.slice(0, 6)}...`);

    // 2. Find or create the Firebase user by phone number
    const adminAuth = getAuth();
    let uid: string;

    try {
      const existingUser = await adminAuth.getUserByPhoneNumber(payload.phone);
      uid = existingUser.uid;
    } catch (lookupError: any) {
      if (lookupError?.code === 'auth/user-not-found') {
        // Create new user — they'll go through onboarding when they tap the chat FAB
        const newUser = await adminAuth.createUser({ phoneNumber: payload.phone });
        uid = newUser.uid;

        // Give new SSO users 1 free session credit (same as regular signup)
        await db.collection('users').doc(newUser.uid).set({
          session_credits: 1,
          created_at: new Date().toISOString(),
          sso_source: payload.source,
        }, { merge: true });

        console.log(`[sso] Created new user ${uid} via SSO from "${payload.source}"`);
      } else {
        throw lookupError;
      }
    }

    // 3. Mint a Firebase custom token
    const customToken = await adminAuth.createCustomToken(uid);

    // 4. Redirect to the client-side callback page
    const callbackUrl = new URL('/sso-callback', url.origin);
    callbackUrl.searchParams.set('token', customToken);
    callbackUrl.searchParams.set('source', payload.source);

    return Response.redirect(callbackUrl.toString(), 302);
  } catch (error: any) {
    console.error('[sso] Error:', error.message);

    // Redirect to landing page with error indicator for user-facing failures
    const url = new URL(req.url);
    const errorUrl = new URL('/', url.origin);
    errorUrl.searchParams.set('sso_error', '1');

    return Response.redirect(errorUrl.toString(), 302);
  }
}
