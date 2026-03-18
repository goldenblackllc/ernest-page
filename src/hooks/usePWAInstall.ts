"use client";

import { useState, useEffect, useCallback } from "react";

const DISMISS_KEY = "pwa-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function getIOSFlags(): { isIOS: boolean; isIOSSafari: boolean } {
    if (typeof window === "undefined" || typeof navigator === "undefined")
        return { isIOS: false, isIOSSafari: false };
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    if (!isIOS) return { isIOS: false, isIOSSafari: false };
    // Detect Safari specifically (exclude Chrome, Firefox, and in-app browsers)
    const isSafari =
        /Safari/.test(ua) &&
        !/CriOS/.test(ua) &&
        !/FxiOS/.test(ua) &&
        !/Chrome/.test(ua);
    return { isIOS: true, isIOSSafari: isSafari };
}

export function usePWAInstall() {
    const [deferredPrompt, setDeferredPrompt] =
        useState<BeforeInstallPromptEvent | null>(null);
    const [isDismissed, setIsDismissed] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isIOSSafari, setIsIOSSafari] = useState(false);

    // Detect iOS and iOS Safari
    useEffect(() => {
        const flags = getIOSFlags();
        setIsIOS(flags.isIOS);
        setIsIOSSafari(flags.isIOSSafari);
    }, []);

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

    // Capture the beforeinstallprompt event (Chrome / Chromium only)
    useEffect(() => {
        if (typeof window === "undefined") return;

        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };

        window.addEventListener("beforeinstallprompt", handler);
        return () => window.removeEventListener("beforeinstallprompt", handler);
    }, []);

    // Chrome path: prompt captured AND not dismissed AND not installed
    // iOS path: on ANY iOS browser AND not in standalone AND not dismissed
    // (No iOS browser supports beforeinstallprompt — all use WebKit)
    const canInstall =
        (!isDismissed &&
            !isInstalled &&
            (!!deferredPrompt || isIOS));

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

    return { canInstall, isInstalled, isIOS, isIOSSafari, promptInstall, dismiss };
}
