"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { LandingPage } from "@/components/LandingPage";
import { Onboarding } from "@/components/Onboarding";

import { TriagePanel } from "@/components/TriagePanel";
import { Ledger } from "@/components/Ledger";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DashboardFooter } from "@/components/DashboardFooter";
import { SupportChat } from "@/components/SupportChat";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { PullToRefresh } from "@/components/PullToRefresh";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterProfile } from "@/types/character";

export default function Home() {
    const { user, loading } = useAuth();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const [profileLoaded, setProfileLoaded] = useState(false);

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

    // Derived state
    const needsOnboarding = profileLoaded && !profile?.identity?.title;

    // All hooks must be called before any early returns
    const handlePullRefresh = useCallback(async () => {
        window.dispatchEvent(new CustomEvent('ledger-refresh'));
        // Wait briefly for the feed to start loading
        await new Promise((resolve) => setTimeout(resolve, 800));
    }, []);

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

    // Authenticated + no profile → Onboarding
    if (needsOnboarding) {
        return <Onboarding onComplete={() => setProfileLoaded(false)} />;
    }


    // Authenticated & onboarded & firewall done → Dashboard
    // No subscription gate — session credits are checked at the chat FAB level
    return (
        <main className="min-h-screen text-zinc-300 font-sans">
            <DashboardHeader />

            <div className="container mx-auto px-0 sm:px-4 pt-[calc(64px+env(safe-area-inset-top))] pb-32 max-w-3xl">
                <PWAInstallBanner />

                <PullToRefresh onRefresh={handlePullRefresh}>
                    {/* Section 1: Triage Panel (The Intake Valve) */}
                    <TriagePanel />

                    {/* Section 2: The Ledger (The Feed) */}
                    <Ledger />
                </PullToRefresh>
            </div>

            <DashboardFooter />
        </main>
    );
}
