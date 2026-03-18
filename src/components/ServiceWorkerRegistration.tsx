"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!("serviceWorker" in navigator)) return;

        navigator.serviceWorker.register("/sw.js").catch(() => {
            // Service worker registration failed — non-critical
        });
    }, []);

    return null;
}
