'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { Sparkles, Loader2 } from 'lucide-react';
import { IdentityForm, IdentityFormData } from './IdentityForm';

interface OnboardingProps {
    onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
    const { user } = useAuth();
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (data: IdentityFormData) => {
        if (!user) return;

        setIsProcessing(true);
        setError(null);

        try {
            const res = await fetch('/api/onboarding/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: user.uid,
                    rant: data.rant.trim(),
                    gender: data.gender.trim(),
                    age: data.age.trim(),
                    ethnicity: data.ethnicity.trim(),
                    important_people: data.people.trim(),
                    things_i_enjoy: data.enjoyments.trim(),
                }),
            });

            const result = await res.json();

            if (!res.ok) {
                throw new Error(result.message || result.error || 'Processing failed.');
            }

            // Process API now kicks off bible+avatar generation in background.
            // Send user directly to the dashboard.
            onComplete();
        } catch (err: any) {
            console.error('Onboarding error:', err);
            setError(err.message || 'Something went wrong. Please try again.');
            setIsProcessing(false);
        }
    };

    if (isProcessing) {
        return (
            <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 py-12">
                <div className="flex flex-col items-center gap-6 animate-in fade-in duration-300">
                    <Sparkles className="w-10 h-10 text-zinc-300 animate-pulse" />
                    <div className="text-center">
                        <h2 className="text-lg font-bold mb-2">Analyzing Your Vision</h2>
                        <p className="text-base text-zinc-400">Discovering who you are.</p>
                    </div>
                    <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 py-12">
            <div className="w-full max-w-lg mx-auto">
                <div className="flex flex-col gap-5 animate-in fade-in duration-300">
                    {error && (
                        <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                            {error}
                        </div>
                    )}

                    <IdentityForm
                        onSubmit={handleSubmit}
                        isSubmitting={isProcessing}
                        submitLabel="Create My Character"
                        showHeadings={true}
                    />

                    <button
                        onClick={() => signOut(auth)}
                        className="text-zinc-500 text-sm text-center hover:text-zinc-300 transition-colors mt-1 py-3"
                    >
                        Sign out
                    </button>
                </div>
            </div>
        </main>
    );
}
