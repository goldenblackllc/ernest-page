import type { User } from 'firebase/auth';

/** fetch() with the signed-in user's Firebase ID token sent as a Bearer header. */
export async function authFetch(user: User, input: string, init: RequestInit = {}): Promise<Response> {
    const idToken = await user.getIdToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${idToken}`);
    return fetch(input, { ...init, headers });
}
