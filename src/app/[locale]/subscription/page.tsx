"use client";

import { DashboardHeader } from "@/components/DashboardHeader";
import { DashboardFooter } from "@/components/DashboardFooter";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { SubscriptionView } from "@/components/SubscriptionView";

export default function SubscriptionPage() {
    return (
        <ProtectedRoute>
            <main className="min-h-screen text-zinc-300 font-sans">
                <DashboardHeader />

                <div className="container mx-auto px-4 pt-[calc(64px+env(safe-area-inset-top))] pb-32 max-w-2xl">
                    <SubscriptionView />
                </div>

                <DashboardFooter />
            </main>
        </ProtectedRoute>
    );
}
