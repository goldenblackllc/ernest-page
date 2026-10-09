"use client";

import { BillingView } from "@/components/payments/BillingView";
import { TriagePanel } from "@/components/TriagePanel";
import { DashboardHeader } from "@/components/DashboardHeader";

import ProtectedRoute from "@/components/auth/ProtectedRoute";

export default function BillingPage() {
    return (
        <ProtectedRoute>
            <main className="flex flex-col min-h-screen text-zinc-300 font-sans">
                <DashboardHeader />

                <div className="flex-1 container mx-auto px-0 sm:px-4 pt-[calc(64px+env(safe-area-inset-top))] pb-32 max-w-3xl">
                    <BillingView />
                    <TriagePanel />
                </div>

            </main>
        </ProtectedRoute>
    );
}
