"use client";

import { CharacterShowcase } from "@/components/CharacterShowcase";
import { TriagePanel } from "@/components/TriagePanel";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DashboardFooter } from "@/components/DashboardFooter";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

export default function ProfilePage() {
    return (
        <ProtectedRoute>
            <main className="min-h-screen text-zinc-300 font-sans">
                <DashboardHeader />

                <div className="container mx-auto px-0 sm:px-4 pt-[calc(64px+env(safe-area-inset-top))] pb-32 max-w-3xl">
                    <CharacterShowcase />
                    <TriagePanel />
                </div>

                <DashboardFooter />
            </main>
        </ProtectedRoute>
    );
}
