"use client";



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



                <div className="container mx-auto px-0 sm:px-4 pt-[calc(64px+env(safe-area-inset-top))] pb-32 max-w-3xl">
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
