"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth, getAuthHint } from "@/lib/auth/AuthContext";
import { useTrackEvent } from "@/lib/analytics/useTrackEvent";
import { LandingPage } from "@/components/LandingPage";

import { TriagePanel } from "@/components/TriagePanel";
import { Ledger } from "@/components/Ledger";
import { DashboardHeader } from "@/components/DashboardHeader";

import { SupportChat } from "@/components/SupportChat";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useTranslations } from "next-intl";

export default function Home() {
    const { user, loading } = useAuth();
    const t = useTranslations();
    const { trackEvent } = useTrackEvent();

    // Defer localStorage-based auth hint until after hydration to prevent
    // server/client mismatch (server has no localStorage).
    const [hasMounted, setHasMounted] = useState(false);
    useEffect(() => { setHasMounted(true); }, []);

    // ── Funnel: track unique visit on mount ──
    useEffect(() => {
        trackEvent('visit');
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // All hooks must be called before any early returns
    const handlePullRefresh = useCallback(async () => {
        window.dispatchEvent(new CustomEvent('ledger-refresh'));
        await new Promise((resolve) => setTimeout(resolve, 800));
    }, []);

    // While Firebase auth is initialising, show the appropriate skeleton.
    // Both server and client must render the SAME output during hydration.
    // We always render the landing page on first paint — the auth hint
    // skeleton only activates after mount to prevent hydration mismatch.
    if (loading) {
        if (!hasMounted) {
            // Server + client first render: always landing page (matches SSR output)
            return (
                <>
                    <LandingPage />
                    <SupportChat standalone />
                </>
            );
        }
        if (getAuthHint()) {
            // Client-only: returning user — show dashboard skeleton
            return (
                <main className="flex flex-col min-h-screen text-zinc-300 font-sans">
                    <div className="fixed top-0 left-0 right-0 z-50 h-16 bg-black/80 backdrop-blur-md border-b border-zinc-800/50" />
                    <div className="flex-1 container mx-auto px-4 pt-[calc(64px+env(safe-area-inset-top)+16px)] pb-32 max-w-3xl">
                        <div className="mb-6 space-y-3">
                            <div className="h-5 w-32 bg-zinc-800/60 rounded-lg animate-pulse" />
                            <div className="h-24 bg-zinc-900/60 rounded-2xl animate-pulse" />
                        </div>
                        {[1, 2].map((i) => (
                            <div key={i} className="mb-4 p-5 bg-zinc-900/40 rounded-2xl animate-pulse" style={{ animationDelay: `${i * 150}ms` }}>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-9 h-9 rounded-full bg-zinc-800/80" />
                                    <div className="space-y-1.5">
                                        <div className="h-3.5 w-24 bg-zinc-800/60 rounded" />
                                        <div className="h-2.5 w-16 bg-zinc-800/40 rounded" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="h-3 w-full bg-zinc-800/50 rounded" />
                                    <div className="h-3 w-3/4 bg-zinc-800/40 rounded" />
                                </div>
                            </div>
                        ))}
                    </div>
                </main>
            );
        }
        // Unknown / first-time visitor — show landing page
        return (
            <>
                <LandingPage />
                <SupportChat standalone />
            </>
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

    // ═══ DASHBOARD (all authenticated users land here) ═══
    return (
        <main className="flex flex-col min-h-screen text-zinc-300 font-sans">
            <DashboardHeader />

            <div className="flex-1 container mx-auto px-0 sm:px-4 pt-[calc(64px+env(safe-area-inset-top))] pb-32 max-w-3xl">
                <PWAInstallBanner />

                <PullToRefresh onRefresh={handlePullRefresh}>
                    {/* Section 1: Triage Panel (The Intake Valve) */}
                    <TriagePanel />

                    {/* Section 2: The Ledger (The Feed) */}
                    <Ledger />
                </PullToRefresh>
            </div>

        </main>
    );
}
