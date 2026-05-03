"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth, getAuthHint } from "@/lib/auth/AuthContext";
import { useTrackEvent } from "@/lib/analytics/useTrackEvent";
import { LandingPage } from "@/components/LandingPage";

import { TriagePanel } from "@/components/TriagePanel";
import { Ledger } from "@/components/Ledger";
import { DashboardHeader } from "@/components/DashboardHeader";

import { SupportChat } from "@/components/SupportChat";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { PullToRefresh } from "@/components/PullToRefresh";
import { IntakeChat } from "@/components/IntakeChat";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterProfile } from "@/types/character";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { ArrowRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

type OnboardingPhase = 'gender' | 'intake' | 'compiling' | 'done';

export default function Home() {
    const { user, loading, signOut } = useAuth();
    const t = useTranslations();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [gender, setGender] = useState('');
    const [genderSubmitting, setGenderSubmitting] = useState(false);
    const [onboardingPhase, setOnboardingPhase] = useState<OnboardingPhase>('gender');
    const [autoOpenChat, setAutoOpenChat] = useState(false);
    const { trackEvent } = useTrackEvent();

    // Defer localStorage-based auth hint until after hydration to prevent
    // server/client mismatch (server has no localStorage).
    const [hasMounted, setHasMounted] = useState(false);
    useEffect(() => { setHasMounted(true); }, []);

    // ── Funnel: track unique visit on mount ──
    useEffect(() => {
        trackEvent('visit');
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!user) {
            setProfile(null);
            setProfileLoaded(false);
            // Reset onboarding state so a re-login starts fresh
            setOnboardingPhase('gender');
            setGender('');
            setGenderSubmitting(false);
            return;
        }

        const unsub = subscribeToCharacterProfile(user.uid, (p) => {
            setProfile(p);
            setProfileLoaded(true);
        });

        return () => unsub();
    }, [user]);

    // Determine which onboarding phase to show
    const isLegacyComplete = !!profile?.identity?.title;
    const hasCompletedOnboarding = profile?.identity?.onboarding_complete || isLegacyComplete;
    const needsOnboarding = profileLoaded && !hasCompletedOnboarding;

    // Reset onboarding phase if profile was wiped (e.g. Firestore doc deleted)
    useEffect(() => {
        if (needsOnboarding && !profile?.identity?.onboarding_started) {
            setOnboardingPhase('gender');
            setGender('');
            setGenderSubmitting(false);
        }
    }, [needsOnboarding, profile?.identity?.onboarding_started]);

    // All hooks must be called before any early returns
    const handlePullRefresh = useCallback(async () => {
        window.dispatchEvent(new CustomEvent('ledger-refresh'));
        await new Promise((resolve) => setTimeout(resolve, 800));
    }, []);

    const handleGenderSubmit = async () => {
        if (!user || !gender.trim() || genderSubmitting) return;
        setGenderSubmitting(true);
        try {
            await setDoc(doc(db, 'users', user.uid), {
                identity: {
                    gender: gender.trim(),
                    onboarding_started: true,
                },
            }, { merge: true });
            setOnboardingPhase('intake');
        } catch (err) {
            console.error('Failed to save gender:', err);
            setGenderSubmitting(false);
        }
    };

    const handleIntakeComplete = async (answers: { rant: string; people: string; enjoyments: string; age: string; ethnicity: string }) => {
        if (!user) return;

        // Mark onboarding complete immediately so user sees dashboard
        await setDoc(doc(db, 'users', user.uid), {
            identity: { onboarding_complete: true },
        }, { merge: true });

        // Fire off the character build in the background
        try {
            const idToken = await user.getIdToken();
            fetch('/api/onboarding/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    rant: answers.rant,
                    gender: profile?.identity?.gender || gender,
                    important_people: answers.people,
                    things_i_enjoy: answers.enjoyments,
                    age: answers.age || '',
                    ethnicity: answers.ethnicity || '',
                    character_name: '',
                }),
            }).catch(err => console.error('[Onboarding] Process error:', err));
        } catch (err) {
            console.error('[Onboarding] Process error:', err);
        }
    };

    // While Firebase auth is initialising, show the appropriate skeleton.
    // Both server and client must render the SAME output during hydration.
    // We always render the landing page on first paint — the auth hint
    // skeleton only activates after mount to prevent hydration mismatch.
    if (loading) {
        if (!hasMounted) {
            // Server + client first render: always landing page (matches SSR output)
            return (
                <>
                    <LandingPage />
                    <SupportChat standalone />
                </>
            );
        }
        if (getAuthHint()) {
            // Client-only: returning user — show dashboard skeleton
            return (
                <main className="flex flex-col min-h-screen text-zinc-300 font-sans">
                    <div className="fixed top-0 left-0 right-0 z-50 h-16 bg-black/80 backdrop-blur-md border-b border-zinc-800/50" />
                    <div className="flex-1 container mx-auto px-4 pt-[calc(64px+env(safe-area-inset-top)+16px)] pb-32 max-w-3xl">
                        <div className="mb-6 space-y-3">
                            <div className="h-5 w-32 bg-zinc-800/60 rounded-lg animate-pulse" />
                            <div className="h-24 bg-zinc-900/60 rounded-2xl animate-pulse" />
                        </div>
                        {[1, 2].map((i) => (
                            <div key={i} className="mb-4 p-5 bg-zinc-900/40 rounded-2xl animate-pulse" style={{ animationDelay: `${i * 150}ms` }}>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-9 h-9 rounded-full bg-zinc-800/80" />
                                    <div className="space-y-1.5">
                                        <div className="h-3.5 w-24 bg-zinc-800/60 rounded" />
                                        <div className="h-2.5 w-16 bg-zinc-800/40 rounded" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="h-3 w-full bg-zinc-800/50 rounded" />
                                    <div className="h-3 w-3/4 bg-zinc-800/40 rounded" />
                                </div>
                            </div>
                        ))}
                    </div>
                </main>
            );
        }
        // Unknown / first-time visitor — show landing page
        return (
            <>
                <LandingPage />
                <SupportChat standalone />
            </>
        );
    }

    // Unauthenticated → Landing page
    if (!user) {
        return (
            <>
                <LandingPage />
                <SupportChat standalone />
            </>
        );
    }

    // Checking profile state — show dashboard skeleton (Firestore offline
    // cache makes this nearly instant, but skeleton covers edge cases)
    if (!profileLoaded) {
        return (
            <main className="flex flex-col min-h-screen text-zinc-300 font-sans">
                <div className="fixed top-0 left-0 right-0 z-50 h-16 bg-black/80 backdrop-blur-md border-b border-zinc-800/50" />
                <div className="flex-1 container mx-auto px-4 pt-[calc(64px+env(safe-area-inset-top)+16px)] pb-32 max-w-3xl">
                    <div className="mb-6 space-y-3">
                        <div className="h-5 w-32 bg-zinc-800/60 rounded-lg animate-pulse" />
                        <div className="h-24 bg-zinc-900/60 rounded-2xl animate-pulse" />
                    </div>
                    {[1, 2].map((i) => (
                        <div key={i} className="mb-4 p-5 bg-zinc-900/40 rounded-2xl animate-pulse" style={{ animationDelay: `${i * 150}ms` }}>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-9 h-9 rounded-full bg-zinc-800/80" />
                                <div className="space-y-1.5">
                                    <div className="h-3.5 w-24 bg-zinc-800/60 rounded" />
                                    <div className="h-2.5 w-16 bg-zinc-800/40 rounded" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="h-3 w-full bg-zinc-800/50 rounded" />
                                <div className="h-3 w-3/4 bg-zinc-800/40 rounded" />
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        );
    }

    // ═══ ONBOARDING FLOW ═══
    if (needsOnboarding) {
        // Phase 1: Gender screen
        if (onboardingPhase === 'gender' && !profile?.identity?.onboarding_started) {
            return (
                <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 py-12 relative">
                    {/* Sign out — go back to landing */}
                    <button
                        onClick={signOut}
                        className="absolute top-6 right-6 text-xs text-zinc-600 hover:text-white transition-colors uppercase tracking-widest font-semibold"
                    >
                        {t('common.signOut')}
                    </button>
                    <div className="w-full max-w-md mx-auto animate-in fade-in duration-300">
                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-black tracking-tight mb-3">
                                {t('onboarding.preChat.heading')}
                            </h1>
                            <p className="text-base text-zinc-400 max-w-sm mx-auto leading-relaxed">
                                {t('onboarding.preChat.subtext')}
                            </p>
                        </div>

                        <div className="mb-6">
                            <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">
                                {t('onboarding.preChat.genderLabel')}
                            </label>
                            <input
                                type="text"
                                value={gender}
                                onChange={(e) => setGender(e.target.value)}
                                placeholder={t('onboarding.preChat.genderPlaceholder')}
                                maxLength={50}
                                autoFocus
                                className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                            />
                        </div>

                        <button
                            onClick={handleGenderSubmit}
                            disabled={!gender.trim() || genderSubmitting}
                            className="w-full bg-white text-black py-3.5 text-base font-bold rounded-xl hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {t('onboarding.preChat.cta')}
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </main>
            );
        }

        // Phase 2: Intake chat
        if (onboardingPhase === 'intake' || (onboardingPhase === 'gender' && profile?.identity?.onboarding_started)) {
            return <IntakeChat onComplete={handleIntakeComplete} onBack={async () => {
                // Reset to gender screen
                if (user) {
                    await setDoc(doc(db, 'users', user.uid), {
                        identity: { onboarding_started: false },
                    }, { merge: true });
                }
                setOnboardingPhase('gender');
                setGender('');
                setGenderSubmitting(false);
            }} />;
        }
    }

    // ═══ DASHBOARD ═══
    return (
        <main className="flex flex-col min-h-screen text-zinc-300 font-sans">
            <DashboardHeader />

            <div className="flex-1 container mx-auto px-0 sm:px-4 pt-[calc(64px+env(safe-area-inset-top))] pb-32 max-w-3xl">
                <PWAInstallBanner />

                <PullToRefresh onRefresh={handlePullRefresh}>
                    {/* Section 1: Triage Panel (The Intake Valve) */}
                    <TriagePanel autoOpenChat={autoOpenChat} />

                    {/* Section 2: The Ledger (The Feed) */}
                    <Ledger />
                </PullToRefresh>
            </div>

        </main>
    );
}
