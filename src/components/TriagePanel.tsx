"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils";
import { MessageCircle, Home, User as UserIcon, BookOpen, Heart, ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from 'next-intl';
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { getMostRecentActiveChat } from "@/lib/firebase/chat";
import { CharacterBible, CharacterIdentity } from "@/types/character";
import { MirrorChat } from "./MirrorChat";
import { SessionPurchaseModal } from "./SessionPurchaseModal";
import { IntakeChat } from "./IntakeChat";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

const MAX_SESSIONS_PER_DAY = 5;

type OnboardingPhase = 'gender' | 'intake';

export function TriagePanel() {
    const { user } = useAuth();
    const pathname = usePathname();
    const t = useTranslations();

    const [isMirrorOpen, setIsMirrorOpen] = useState(false);
    const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
    const [isDailyCapHit, setIsDailyCapHit] = useState(false);
    const [initialContext, setInitialContext] = useState<string | null>(null);

    // Data for Mirror Chat
    const [bible, setBible] = useState<CharacterBible | null>(null);
    const [identity, setIdentity] = useState<CharacterIdentity | null>(null);
    const [defaultPostRouting, setDefaultPostRouting] = useState<'private' | 'community' | 'public'>('community');

    // Onboarding state (triggered when FAB tapped without character bible)
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [onboardingPhase, setOnboardingPhase] = useState<OnboardingPhase>('gender');
    const [gender, setGender] = useState('');
    const [genderSubmitting, setGenderSubmitting] = useState(false);
    const [needsOnboarding, setNeedsOnboarding] = useState(false);

    // Session credit / subscription state
    const [sessionCredits, setSessionCredits] = useState<number>(0);
    const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
    const [sessionsToday, setSessionsToday] = useState<number>(0);

    useEffect(() => {
        if (!user) return;
        const unsubscribe = subscribeToCharacterProfile(user.uid, (data) => {
            setBible(data.character_bible);
            setIdentity(data.identity || null);
            setDefaultPostRouting(data.default_post_routing || 'community');
            setSessionCredits(data.session_credits || 0);

            // Check if user needs onboarding (no completed onboarding)
            const isLegacyComplete = !!data.identity?.title;
            const hasCompletedOnboarding = data.identity?.onboarding_complete || isLegacyComplete;
            setNeedsOnboarding(!hasCompletedOnboarding);

            // Daily session count
            const today = new Date().toISOString().split('T')[0];
            setSessionsToday(data.sessions_today_date === today ? (data.sessions_today || 0) : 0);

            // Check subscription
            const sub = data.subscription;
            if (sub && (sub.status === 'active' || sub.status === 'past_due')) {
                const endDate = sub.currentPeriodEnd || sub.subscribedUntil;
                setHasActiveSubscription(endDate ? new Date(endDate) > new Date() : false);
            } else {
                setHasActiveSubscription(false);
            }
        });
        return () => unsubscribe();
    }, [user]);



    // Listen for 'open-mirror-chat' custom event (e.g. from Ledger first-session card)
    useEffect(() => {
        const handleOpen = () => setIsMirrorOpen(true);
        window.addEventListener('open-mirror-chat', handleOpen);
        return () => window.removeEventListener('open-mirror-chat', handleOpen);
    }, []);

    // Listen for 30-day check-in card tap
    useEffect(() => {
        const handleCheckin = (e: any) => {
            const context = e.detail?.context;
            if (context) {
                setInitialContext(context);
                attemptStartSession();
            }
        };
        window.addEventListener('open-mirror-checkin', handleCheckin);
        return () => window.removeEventListener('open-mirror-checkin', handleCheckin);
    }, [hasActiveSubscription, sessionCredits, sessionsToday]);

    const canChat = hasActiveSubscription || sessionCredits > 0;
    const isBibleReady = bible != null && (bible.compiled_output?.ideal?.length ?? 0) > 0;
    const dailyRemaining = MAX_SESSIONS_PER_DAY - sessionsToday;

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

        // Mark onboarding complete immediately
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
                    gender: identity?.gender || gender,
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

        // Close onboarding and the chat bubble will now be enabled
        // (bible will be compiling, user sees the feed)
        setShowOnboarding(false);
        setNeedsOnboarding(false);
    };

    const attemptStartSession = async () => {
        // If no character bible AND needs onboarding, show the onboarding flow
        if (!isBibleReady && needsOnboarding) {
            setShowOnboarding(true);
            return;
        }

        if (!isBibleReady) return; // Bible is compiling, can't start yet

        if (!canChat) {
            setIsPurchaseOpen(true);
            return;
        }

        // Layer 1: Resume existing session without re-charging
        try {
            const existingSession = await getMostRecentActiveChat(user!.uid);
            if (existingSession) {
                setIsMirrorOpen(true);
                return;
            }
        } catch {
            // If lookup fails, continue with normal flow
        }

        // Layer 2: Check access without consuming credit (deferred to first message)
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch('/api/check-session-access', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
                },
            });
            const data = await res.json();

            if (data.reason === 'daily_limit') {
                setIsDailyCapHit(true);
                setTimeout(() => setIsDailyCapHit(false), 5000);
                return;
            }

            if (!data.canStart) {
                setIsPurchaseOpen(true);
                return;
            }

            setIsMirrorOpen(true);
        } catch {
            // Network error — try opening anyway, server will catch on next API call
            setIsMirrorOpen(true);
        }
    };

    const handlePurchaseComplete = async () => {
        // Credits are now confirmed in Firestore by /api/confirm-purchase.
        // With deferred consumption, we just need to verify access and open the chat.
        const idToken = await user?.getIdToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetch('/api/check-session-access', {
                    method: 'POST',
                    headers,
                });
                const data = await res.json();

                if (data.reason === 'daily_limit') {
                    setIsDailyCapHit(true);
                    setTimeout(() => setIsDailyCapHit(false), 5000);
                    return;
                }

                if (data.canStart) {
                    setIsMirrorOpen(true);
                    return;
                }

                // Credits not visible yet — wait and retry
                if (attempt < 2) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch {
                if (attempt < 2) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        }

        // All retries exhausted — open anyway, mirror route will re-check
        setIsMirrorOpen(true);
    };

    return (
        <>
            {/* BOTTOM NAV BAR */}
            <div className="fixed bottom-0 left-0 w-full z-40 bg-black/90 backdrop-blur-md border-t border-zinc-800 pb-safe">
                <div className="max-w-md mx-auto px-8 h-16 flex items-center justify-between relative">
                    <Link href="/" className={cn("p-2 transition-colors", pathname === "/" ? "text-white" : "text-zinc-500 hover:text-white")}>
                        <Home className="w-6 h-6" />
                    </Link>
                    <Link href="/my-posts" className={cn("p-2 transition-colors", pathname === "/my-posts" ? "text-white" : "text-zinc-500 hover:text-white")}>
                        <BookOpen className="w-6 h-6" />
                    </Link>
                    {/* Spacer for center FAB */}
                    <div className="w-16" />
                    <Link href="/saved" className={cn("p-2 transition-colors", pathname === "/saved" ? "text-white" : "text-zinc-500 hover:text-white")}>
                        <Heart className="w-6 h-6" />
                    </Link>
                    <Link href="/profile" className={cn("p-2 transition-colors", pathname === "/profile" ? "text-white" : "text-zinc-500 hover:text-white")}>
                        <UserIcon className="w-6 h-6" />
                    </Link>
                </div>
            </div>

            {/* FAB — Opens Mirror Chat, Purchase Modal, or Onboarding */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
                <button
                    onClick={attemptStartSession}
                    disabled={!isBibleReady && !needsOnboarding}
                    className={cn(
                        "w-16 h-16 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex items-center justify-center transition-all duration-300 ring-4 ring-black",
                        (!isBibleReady && !needsOnboarding)
                            ? "bg-zinc-700 text-zinc-500 cursor-not-allowed opacity-60"
                            : "bg-white text-black hover:scale-110 active:scale-95"
                    )}
                    title={
                        needsOnboarding
                            ? t('triagePanel.startOnboarding')
                            : !isBibleReady
                                ? t('triagePanel.buildingCharacter')
                                : canChat ? t('triagePanel.openChat') : t('triagePanel.purchaseSession')
                    }
                >
                    <MessageCircle className={cn("w-7 h-7", !isBibleReady && !needsOnboarding && "animate-pulse")} />
                </button>



                {/* Daily cap toast */}
                {isDailyCapHit && (
                    <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-zinc-900 border border-amber-900/30 text-amber-400 text-xs font-semibold px-4 py-2.5 rounded-xl whitespace-nowrap shadow-lg animate-in fade-in slide-in-from-bottom-2">
                        {t('triagePanel.dailyLimit')}
                    </div>
                )}
            </div>

            {/* Mirror Chat Modal */}
            <MirrorChat
                isOpen={isMirrorOpen}
                onClose={() => { setIsMirrorOpen(false); setInitialContext(null); }}
                bible={bible}
                identity={identity}
                uid={user?.uid || ""}
                initialContext={initialContext}
                defaultPostRouting={defaultPostRouting}
                isUnlimited={hasActiveSubscription}
                onNeedsPurchase={() => { setIsMirrorOpen(false); setIsPurchaseOpen(true); }}
            />

            {/* Session Purchase Modal */}
            <SessionPurchaseModal
                isOpen={isPurchaseOpen}
                onClose={() => setIsPurchaseOpen(false)}
                onPurchased={handlePurchaseComplete}
            />

            {/* Onboarding Overlay — triggered by FAB when no character bible */}
            {showOnboarding && (
                onboardingPhase === 'gender' && !identity?.onboarding_started ? (
                    <div className="fixed inset-0 z-[60] bg-black text-white flex flex-col items-center justify-center px-6 py-12">
                        <button
                            onClick={() => setShowOnboarding(false)}
                            className="absolute top-6 right-6 text-xs text-zinc-600 hover:text-white transition-colors uppercase tracking-widest font-semibold"
                        >
                            {t('common.close')}
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
                    </div>
                ) : (
                    <IntakeChat
                        onComplete={handleIntakeComplete}
                        onBack={async () => {
                            if (user) {
                                await setDoc(doc(db, 'users', user.uid), {
                                    identity: { onboarding_started: false },
                                }, { merge: true });
                            }
                            setOnboardingPhase('gender');
                            setGender('');
                            setGenderSubmitting(false);
                        }}
                    />
                )
            )}
        </>
    );
}
