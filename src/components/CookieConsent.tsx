'use client';

import { useState, useEffect } from 'react';

/**
 * Minimal cookie consent banner for EU/UK visitors.
 * Shows only for users who haven't already dismissed it.
 * Non-blocking — essential cookies only (auth).
 */
export function CookieConsent() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Check if already consented
        if (typeof window !== 'undefined') {
            const consented = localStorage.getItem('ep_cookie_consent');
            if (!consented) {
                // Small delay so it doesn't flash on load
                const timer = setTimeout(() => setVisible(true), 1500);
                return () => clearTimeout(timer);
            }
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem('ep_cookie_consent', 'accepted');
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[60] p-4 sm:p-6 pointer-events-none">
            <div className="max-w-lg mx-auto bg-zinc-950 border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-2xl shadow-black/60 pointer-events-auto">
                <div className="flex items-start gap-4">
                    <div className="flex-1">
                        <p className="text-sm text-zinc-300 leading-relaxed">
                            We use essential cookies for authentication and security. No tracking, no ads.
                        </p>
                        <a
                            href="/privacy"
                            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mt-1 inline-block"
                        >
                            Read our Privacy Policy →
                        </a>
                    </div>
                    <button
                        onClick={handleAccept}
                        className="shrink-0 rounded-full bg-white text-black px-5 py-2 text-xs font-bold tracking-wide hover:bg-zinc-200 active:scale-[0.97] transition-all duration-150"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
}
