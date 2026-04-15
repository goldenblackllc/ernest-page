"use client";

import { ProfileView } from "@/components/ProfileView";
import { TriagePanel } from "@/components/TriagePanel";
import { DashboardHeader } from "@/components/DashboardHeader";

import ProtectedRoute from "@/components/auth/ProtectedRoute";

export default function ProfilePage() {
    return (
        <ProtectedRoute>
            <main className="flex flex-col min-h-screen text-zinc-300 font-sans">
                <DashboardHeader />

                <div className="flex-1 container mx-auto px-0 sm:px-4 pt-[calc(64px+env(safe-area-inset-top))] pb-32 max-w-3xl">
                    <ProfileView />
                    <TriagePanel />
                </div>

            </main>
        </ProtectedRoute>
    );
}
