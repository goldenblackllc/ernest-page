"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { LandingPage } from "@/components/LandingPage";
import { Tollbooth } from "@/components/Tollbooth";
import { Onboarding } from "@/components/Onboarding";
import { ContactFirewall } from "@/components/ContactFirewall";
import { TriagePanel } from "@/components/TriagePanel";
import { Ledger } from "@/components/Ledger";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DashboardFooter } from "@/components/DashboardFooter";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterProfile } from "@/types/character";

const BYPASS_PAYWALL = process.env.NEXT_PUBLIC_BYPASS_PAYWALL === 'true';

function isSubscriptionActive(sub?: CharacterProfile['subscription']): boolean {
    if (!sub || sub.status !== 'active') return false;
    if (!sub.subscribedUntil) return false;
    return new Date(sub.subscribedUntil) > new Date();
}

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
    const hasSubscription = BYPASS_PAYWALL || isSubscriptionActive(profile?.subscription);

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
        return <LandingPage />;
    }

    // Checking profile state
    if (!profileLoaded) {
        return (
            <main className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-[10px] uppercase tracking-widest text-zinc-600 animate-pulse">Loading...</div>
            </main>
        );
    }

    // Authenticated + no subscription → Tollbooth
    if (!hasSubscription) {
        return <Tollbooth onComplete={() => setProfileLoaded(false)} />;
    }

    // Authenticated + subscribed + no profile → Onboarding
    if (needsOnboarding) {
        return <Onboarding onComplete={() => setProfileLoaded(false)} />;
    }

    // Authenticated + onboarded + no firewall → Contact Firewall
    if (!profile?.firewall_synced) {
        return <ContactFirewall onComplete={() => setProfileLoaded(false)} />;
    }

    // Authenticated & subscribed & onboarded & firewall done → Dashboard
    return (
        <main className="min-h-screen text-zinc-300 font-sans">
            <DashboardHeader />

            <div className="container mx-auto px-0 sm:px-4 pt-[calc(64px+env(safe-area-inset-top))] pb-32 max-w-3xl">
                {/* Section 1: Triage Panel (The Intake Valve) */}
                <TriagePanel />

                {/* Section 2: The Ledger (The Feed) */}
                <Ledger />
            </div>

            <DashboardFooter />
        </main>
    );
}
