"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils";
import { MessageCircle, Home, User as UserIcon } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from 'next-intl';
import { useAudioMute } from "@/context/AudioMuteContext";
import { subscribeToCharacterProfile, updateWants, updateLoves, updatePeople, updateDream } from "@/lib/firebase/character";
import { getMostRecentActiveChat } from "@/lib/firebase/chat";
import { Bible, CharacterProfile, WantItem, ProfilePerson } from "@/types/character";
import { MirrorChat } from "./MirrorChat";
import { OnboardingForm, OnboardingFormData } from "./OnboardingForm";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

// My Life components
import { PillBar, MyLifeSection } from "./mylife/PillBar";
import { MyLifeDrawer } from "./mylife/MyLifeDrawer";
import { WantsEditor } from "./mylife/WantsEditor";
import { LovesEditor } from "./mylife/LovesEditor";
import { PeopleEditor } from "./mylife/PeopleEditor";
import { DreamEditor } from "./mylife/DreamEditor";

const MAX_SESSIONS_PER_DAY = 5;



export function TriagePanel() {
    const { user } = useAuth();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const t = useTranslations();
    const { pauseAll, suppressAutoPlay, unsuppressAutoPlay } = useAudioMute();

    const [isMirrorOpen, setIsMirrorOpen] = useState(false);
    const [isDailyCapHit, setIsDailyCapHit] = useState(false);
    const [initialContext, setInitialContext] = useState<string | null>(null);

    /** Pause all background audio, then open the mirror chat overlay. */
    const openMirror = useCallback(() => {
        pauseAll();
        setIsMirrorOpen(true);
    }, [pauseAll]);

    // Data for Mirror Chat & My Life drawers
    const [bible, setBible] = useState<Bible | null>(null);
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const [defaultPostRouting, setDefaultPostRouting] = useState<'private' | 'public' | 'burn'>('private');

    // Onboarding state (triggered when FAB tapped without character bible)
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [needsOnboarding, setNeedsOnboarding] = useState(false);

    // Session state
    const [sessionsToday, setSessionsToday] = useState<number>(0);

    // My Life drawer state
    const [activeSection, setActiveSection] = useState<MyLifeSection | null>(null);

    useEffect(() => {
        if (!user) return;
        const unsubscribe = subscribeToCharacterProfile(user.uid, (data) => {
            setBible(data.bible || null);
            setProfile(data || null);
            setDefaultPostRouting(data.default_post_routing || 'private');

            // Check if user needs onboarding (no completed onboarding)
            const isLegacyComplete = !!data.defining_words;
            const hasCompletedOnboarding = data.onboarding_complete || isLegacyComplete;
            setNeedsOnboarding(!hasCompletedOnboarding);

            // Daily session count
            const today = new Date().toISOString().split('T')[0];
            setSessionsToday(data.sessions_today_date === today ? (data.sessions_today || 0) : 0);
        });
        return () => unsubscribe();
    }, [user]);

    // Automatically trigger onboarding if needed
    useEffect(() => {
        if (needsOnboarding) {
            setShowOnboarding(true);
        }
    }, [needsOnboarding]);

    // Dev preview: ?onboarding=preview opens the overlay with existing data (no reset needed)
    useEffect(() => {
        if (process.env.NODE_ENV === 'development' && searchParams.get('onboarding') === 'preview') {
            setShowOnboarding(true);
        }
    }, [searchParams]);

    // Suppress feed auto-play while the onboarding overlay is visible
    useEffect(() => {
        if (showOnboarding) {
            suppressAutoPlay();
        } else {
            unsuppressAutoPlay();
        }
    }, [showOnboarding, suppressAutoPlay, unsuppressAutoPlay]);



    // Listen for 'open-mirror-chat' custom event (e.g. from Ledger first-session card)
    useEffect(() => {
        const handleOpen = () => openMirror();
        window.addEventListener('open-mirror-chat', handleOpen);
        return () => window.removeEventListener('open-mirror-chat', handleOpen);
    }, [openMirror]);

    // Listen for identity editor
    useEffect(() => {
        const handleIdentityEditor = () => { window.location.href = '/profile?edit=identity'; };
        window.addEventListener('open-identity-editor', handleIdentityEditor);
        return () => window.removeEventListener('open-identity-editor', handleIdentityEditor);
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
    }, [sessionsToday]);

    const isBibleReady = bible != null && (bible.sections?.length ?? 0) > 0;



    const handleOnboardingSubmit = async (data: OnboardingFormData) => {
        if (!user) return;

        // Build wants as WantItem[]
        const wantItems: WantItem[] = data.wants.map(text => ({
            id: crypto.randomUUID(),
            text,
            completed: false,
            created_at: Date.now(),
        }));

        // Build people as ProfilePerson[]
        const peopleItems: ProfilePerson[] = data.people.map(p => ({
            name: p.name,
            relationship: p.relationship,
            who: p.about,
        }));

        // Write all fields directly to Firestore
        await setDoc(doc(db, 'users', user.uid), {
            name: data.name.trim(),
            defining_words: data.defining_words,
            wants: wantItems,
            interests: data.interests,
            people: peopleItems,
            dream_living: data.dream_living.trim(),
            dream_financial: data.dream_financial.trim(),
            gender: data.gender.trim(),
            birthdate: data.birthdate.trim(),
            ethnicity: data.ethnicity.trim(),
            skin_tone: data.skin_tone.trim(),
            hair_colors: data.hair_colors,
            hair_texture: data.hair_texture.trim(),
            eye_color: data.eye_color.trim(),
            height: data.height.trim(),
            onboarding_complete: true,
            bible: { status: 'compiling', last_updated: Date.now() },
        }, { merge: true });

        // Trigger bible compile + initial dossier in the background
        try {
            const idToken = await user.getIdToken();
            fetch('/api/onboarding/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    defining_words: data.defining_words,
                    name: data.name.trim(),
                    gender: data.gender.trim(),
                    birthdate: data.birthdate.trim(),
                    ethnicity: data.ethnicity.trim(),
                    skin_tone: data.skin_tone.trim(),
                    hair_colors: data.hair_colors,
                    eye_color: data.eye_color.trim(),
                    height: data.height.trim(),
                }),
            }).catch(err => console.error('[Onboarding] Process error:', err));
        } catch (err) {
            console.error('[Onboarding] Process error:', err);
        }

        // Close onboarding — bible will be compiling, user sees the feed
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

        // Check access (daily cap)
        try {
            const existingSession = await getMostRecentActiveChat(user!.uid);
            if (existingSession) {
                openMirror();
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
                setIsDailyCapHit(true);
                setTimeout(() => setIsDailyCapHit(false), 5000);
                return;
            }

            openMirror();
        } catch {
            // Network error — try opening anyway, server will catch on next API call
            openMirror();
        }
    };

    // ─── My Life Drawer Save Handlers ─────────────────────────────────────────

    const handleSaveWants = useCallback((wants: WantItem[]) => {
        if (!user) return;
        updateWants(user.uid, wants);
    }, [user]);

    const handleSaveLoves = useCallback((interests: string[]) => {
        if (!user) return;
        updateLoves(user.uid, interests);
    }, [user]);

    const handleSavePeople = useCallback((people: ProfilePerson[]) => {
        if (!user) return;
        updatePeople(user.uid, people);
    }, [user]);

    const handleSaveDream = useCallback((updates: { defining_words?: string[]; dream_living?: string; dream_financial?: string }) => {
        if (!user) return;
        updateDream(user.uid, updates);
    }, [user]);

    // Close drawer when mirror chat opens
    useEffect(() => {
        if (isMirrorOpen) setActiveSection(null);
    }, [isMirrorOpen]);

    // Render the active drawer's editor content
    const renderDrawerContent = () => {
        switch (activeSection) {
            case 'wants':
                return (
                    <WantsEditor
                        wants={profile?.wants || []}
                        onSave={handleSaveWants}
                    />
                );
            case 'loves':
                return (
                    <LovesEditor
                        interests={profile?.interests || []}
                        onSave={handleSaveLoves}
                    />
                );
            case 'people':
                return (
                    <PeopleEditor
                        people={profile?.people || []}
                        onSave={handleSavePeople}
                    />
                );
            case 'dream':
                return (
                    <DreamEditor
                        key="dream"
                        definingWords={profile?.defining_words || []}
                        dreamLiving={profile?.dream_living || ''}
                        dreamFinancial={profile?.dream_financial || ''}
                        onSave={handleSaveDream}
                    />
                );
            default:
                return null;
        }
    };


    return (
        <>
            {/* My Life Drawer Overlay */}
            <MyLifeDrawer
                isOpen={activeSection !== null}
                onClose={() => setActiveSection(null)}
            >
                {renderDrawerContent()}
            </MyLifeDrawer>

            {/* BOTTOM NAV AREA — Pill Bar + Nav Bar */}
            <div className="fixed bottom-0 left-0 w-full z-40 bg-black/90 backdrop-blur-md border-t border-zinc-800 pb-safe">
                {/* Pill Bar */}
                <PillBar
                    activeSection={activeSection}
                    onSelect={setActiveSection}
                />

                {/* Nav Bar — Home / FAB / Profile */}
                <div className="max-w-xs mx-auto px-4 h-14 flex items-center justify-between relative">
                    <Link href="/" className={cn("p-2 transition-colors flex flex-col items-center gap-0.5", pathname === "/" ? "text-white" : "text-zinc-500 hover:text-white")}>
                        <Home className="w-6 h-6" />
                        <span className="text-[10px] font-medium">Home</span>
                    </Link>

                    {/* FAB — centered in nav bar */}
                    <button
                        onClick={attemptStartSession}
                        disabled={!isBibleReady && !needsOnboarding}
                        className={cn(
                            "w-14 h-14 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex items-center justify-center transition-all duration-300 ring-4 ring-black -mt-6",
                            (!isBibleReady && !needsOnboarding)
                                ? "bg-zinc-700 text-zinc-500 cursor-not-allowed opacity-60"
                                : "bg-white text-black hover:scale-110 active:scale-95"
                        )}
                        title={
                            needsOnboarding
                                ? t('triagePanel.startOnboarding')
                                : !isBibleReady
                                    ? t('triagePanel.buildingCharacter')
                                    : t('triagePanel.openChat')
                        }
                    >
                        <MessageCircle className={cn("w-7 h-7", !isBibleReady && !needsOnboarding && "animate-pulse")} />
                    </button>

                    <Link href="/profile" className={cn("p-2 transition-colors flex flex-col items-center gap-0.5", pathname === "/profile" ? "text-white" : "text-zinc-500 hover:text-white")}>
                        <UserIcon className="w-6 h-6" />
                        <span className="text-[10px] font-medium">Profile</span>
                    </Link>
                </div>

                {/* Daily cap toast */}
                {isDailyCapHit && (
                    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 border border-amber-900/30 text-amber-400 text-xs font-semibold px-4 py-2.5 rounded-xl whitespace-nowrap shadow-lg animate-in fade-in slide-in-from-bottom-2">
                        {t('triagePanel.dailyLimit')}
                    </div>
                )}
            </div>


            {/* Mirror Chat Modal */}
            <MirrorChat
                isOpen={isMirrorOpen}
                onClose={() => {
                    setIsMirrorOpen(false);
                    setInitialContext(null);
                }}
                profile={profile}
                uid={user?.uid || ""}
                initialContext={initialContext}
                defaultPostRouting={defaultPostRouting}
            />

            {/* Onboarding Overlay — triggered by FAB when no character bible */}
            {showOnboarding && (
                <div className="fixed inset-0 z-[60] bg-zinc-950 flex flex-col">
                    {/* Header */}
                    <div className="shrink-0 border-b border-white/5 px-6 py-4 bg-zinc-900/50 flex items-center justify-between pt-[calc(16px+env(safe-area-inset-top))]">
                        <h2 className="text-sm font-bold text-white">{t('onboarding.headerTitle')}</h2>
                        <button
                            onClick={() => setShowOnboarding(false)}
                            className="text-zinc-500 hover:text-white transition-colors text-sm font-semibold py-2 px-3"
                        >
                            {t('common.close')}
                        </button>
                    </div>

                    {/* Form — fills remaining screen height */}
                    <div className="flex-1 flex flex-col min-h-0 px-6 pt-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
                        <OnboardingForm
                            key={profile ? 'loaded' : 'empty'}
                            onSubmit={handleOnboardingSubmit}
                            initialValues={profile ? {
                                name: profile.name || '',
                                defining_words: profile.defining_words || [],
                                wants: (profile.wants || []).map((w: any) => w.text || ''),
                                interests: profile.interests || [],
                                people: (profile.people || []).map((p: any) => ({
                                    name: p.name || '',
                                    relationship: p.relationship || '',
                                    about: p.who || '',
                                })),
                                dream_living: profile.dream_living || '',
                                dream_financial: profile.dream_financial || '',
                                gender: profile.gender || '',
                                birthdate: profile.birthdate || '',
                                ethnicity: profile.ethnicity || '',
                                skin_tone: profile.skin_tone || '',
                                hair_colors: profile.hair_colors || [],
                                hair_texture: profile.hair_texture || '',
                                eye_color: profile.eye_color || '',
                                height: profile.height || '',
                            } : undefined}
                        />
                    </div>
                </div>
            )}
        </>
    );
}
