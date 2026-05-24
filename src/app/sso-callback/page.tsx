'use client';

import { useEffect, useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SSOCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    const source = searchParams.get('source');

    if (!token) {
      setError('Invalid SSO link. Please try again.');
      return;
    }

    (async () => {
      try {
        await signInWithCustomToken(auth, token);
        console.log(`[sso-callback] Signed in via SSO from "${source}"`);
        // Go to the main page — same destination as regular login
        router.replace('/');
      } catch (err) {
        console.error('[sso-callback] Sign-in failed:', err);
        setError('Sign-in failed. The link may have expired. Please try again.');
      }
    })();
  }, [searchParams, router]);

  if (error) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold mb-4">Sign-In Error</h1>
          <p className="text-zinc-400 text-sm mb-8">{error}</p>
          <a
            href="/"
            className="inline-block bg-white text-black px-8 py-3 rounded-full text-sm font-bold hover:bg-zinc-200 transition-colors"
          >
            Go to Login
          </a>
        </div>
      </main>
    );
  }

  // Loading state while signing in
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-white animate-spin mx-auto mb-6" />
        <p className="text-sm text-zinc-400">Signing you in...</p>
      </div>
    </main>
  );
}

export default function SSOCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
          <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-white animate-spin" />
        </main>
      }
    >
      <SSOCallbackInner />
    </Suspense>
  );
}
