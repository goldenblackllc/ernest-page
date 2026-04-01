"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { LandingPage } from "@/components/LandingPage";

import { TriagePanel } from "@/components/TriagePanel";
import { Ledger } from "@/components/Ledger";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DashboardFooter } from "@/components/DashboardFooter";
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
    const { user, loading } = useAuth();
    const t = useTranslations();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [gender, setGender] = useState('');
    const [genderSubmitting, setGenderSubmitting] = useState(false);
    const [onboardingPhase, setOnboardingPhase] = useState<OnboardingPhase>('gender');
    const [autoOpenChat, setAutoOpenChat] = useState(false);

    useEffect(() => {
        if (!user) {
            setProfile(null);
            setProfileLoaded(false);
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

    // Show nothing while checking auth state
    if (loading) {
        return (
            <main className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-[10px] uppercase tracking-widest text-zinc-600 animate-pulse">Loading...</div>
            </main>
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

    // Checking profile state
    if (!profileLoaded) {
        return (
            <main className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-[10px] uppercase tracking-widest text-zinc-600 animate-pulse">Loading...</div>
            </main>
        );
    }

    // ═══ ONBOARDING FLOW ═══
    if (needsOnboarding) {
        // Phase 1: Gender screen
        if (onboardingPhase === 'gender' && !profile?.identity?.onboarding_started) {
            return (
                <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 py-12">
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
            return <IntakeChat onComplete={handleIntakeComplete} />;
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

            <DashboardFooter />
        </main>
    );
}
