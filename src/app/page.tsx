"use client";


import { IdentityAnchor } from "@/components/IdentityAnchor";
import { CharacterShowcase } from "@/components/CharacterShowcase";
import { TriagePanel } from "@/components/TriagePanel";
import { Ledger } from "@/components/Ledger";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DashboardFooter } from "@/components/DashboardFooter";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

export default function Home() {
    return (
        <ProtectedRoute>
            <main className="min-h-screen text-zinc-300 font-sans">
                <DashboardHeader />

                {/* Section -1: Identity Anchor (The Header) */}
                <IdentityAnchor />

                <div className="container mx-auto px-4 pt-24 pb-32 max-w-3xl">
                    {/* Section 0: Character Showcase (The Engine) */}
                    <CharacterShowcase />

                    {/* Section 1: Triage Panel (The Intake Valve) - NOW FIXED BOTTOM */}
                    <TriagePanel />

                    {/* Section 2: The Ledger (The Feed) */}
                    <Ledger />
                </div>

                <DashboardFooter />
            </main>
        </ProtectedRoute>
    );
}
