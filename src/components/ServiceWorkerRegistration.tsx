"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator)) return;

        navigator.serviceWorker.register("/sw.js").then((registration) => {
            // Check for updates immediately on load
            registration.update().catch(() => {});

            // Also check for updates every 30 minutes while tab is open
            const interval = setInterval(() => {
                registration.update().catch(() => {});
            }, 30 * 60 * 1000);

            return () => clearInterval(interval);
        }).catch(() => {
            // Service worker registration failed — non-critical
        });
    }, []);

    return null;
}
