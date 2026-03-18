"use client";

import { useState, useEffect, useCallback } from "react";

const DISMISS_KEY = "pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePWAInstall() {
    const [deferredPrompt, setDeferredPrompt] =
        useState<BeforeInstallPromptEvent | null>(null);
    const [isDismissed, setIsDismissed] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    // Check if already installed (standalone mode)
    useEffect(() => {
        if (typeof window === "undefined") return;

        const mq = window.matchMedia("(display-mode: standalone)");
        setIsInstalled(mq.matches);

        const handler = (e: MediaQueryListEvent) => setIsInstalled(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

    // Read dismiss state from localStorage
    useEffect(() => {
        if (typeof window === "undefined") return;
        setIsDismissed(localStorage.getItem(DISMISS_KEY) === "true");
    }, []);

    // Capture the beforeinstallprompt event
    useEffect(() => {
        if (typeof window === "undefined") return;

        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };

        window.addEventListener("beforeinstallprompt", handler);
        return () => window.removeEventListener("beforeinstallprompt", handler);
    }, []);

    const canInstall = !!deferredPrompt && !isDismissed && !isInstalled;

    const promptInstall = useCallback(async () => {
        if (!deferredPrompt) return;

        await deferredPrompt.prompt();
        const result = await deferredPrompt.userChoice;

        if (result.outcome === "accepted") {
            setIsInstalled(true);
        }

        // Clear the deferred prompt either way — it can only be used once
        setDeferredPrompt(null);
    }, [deferredPrompt]);

    const dismiss = useCallback(() => {
        setIsDismissed(true);
        if (typeof window !== "undefined") {
            localStorage.setItem(DISMISS_KEY, "true");
        }
    }, []);

    return { canInstall, isInstalled, promptInstall, dismiss };
}
