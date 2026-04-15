"use client";

import { DashboardHeader } from "@/components/DashboardHeader";

import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { SubscriptionView } from "@/components/SubscriptionView";

export default function SubscriptionPage() {
    return (
        <ProtectedRoute>
            <main className="flex flex-col min-h-screen text-zinc-300 font-sans">
                <DashboardHeader />

                <div className="flex-1 container mx-auto px-4 pt-[calc(64px+env(safe-area-inset-top))] pb-32 max-w-2xl">
                    <SubscriptionView />
                </div>

            </main>
        </ProtectedRoute>
    );
}
