"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { LandingPage } from "@/components/LandingPage";
import { CharacterShowcase } from "@/components/CharacterShowcase";
import { TriagePanel } from "@/components/TriagePanel";
import { Ledger } from "@/components/Ledger";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DashboardFooter } from "@/components/DashboardFooter";

export default function Home() {
    const { user, loading } = useAuth();

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

    // Authenticated → Dashboard
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
