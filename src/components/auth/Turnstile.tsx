'use client';

import { useEffect, useRef, useCallback } from 'react';

declare global {
    interface Window {
        turnstile?: {
            render: (container: HTMLElement, options: Record<string, unknown>) => string;
            reset: (widgetId: string) => void;
            remove: (widgetId: string) => void;
        };
    }
}

interface TurnstileProps {
    onVerify: (token: string) => void;
    onExpire?: () => void;
    theme?: 'light' | 'dark' | 'auto';
    className?: string;
}

export default function Turnstile({ onVerify, onExpire, theme = 'auto', className }: TurnstileProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const onVerifyRef = useRef(onVerify);
    const onExpireRef = useRef(onExpire);

    // Keep callback refs current without re-triggering the effect
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;

    const renderWidget = useCallback(() => {
        const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
        if (!siteKey || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current !== null) return; // already rendered

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            callback: (token: string) => onVerifyRef.current(token),
            'expired-callback': () => onExpireRef.current?.(),
            theme,
            size: 'flexible',
        });
    }, [theme]);

    useEffect(() => {
        // If Turnstile script already loaded, render immediately
        if (window.turnstile) {
            renderWidget();
            return;
        }

        // Load the Turnstile script
        const existingScript = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]');
        if (!existingScript) {
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.onload = () => renderWidget();
            document.head.appendChild(script);
        } else {
            // Script is loading — poll briefly until ready
            const interval = setInterval(() => {
                if (window.turnstile) {
                    clearInterval(interval);
                    renderWidget();
                }
            }, 100);
            return () => clearInterval(interval);
        }
    }, [renderWidget]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (widgetIdRef.current !== null && window.turnstile) {
                try { window.turnstile.remove(widgetIdRef.current); } catch { /* ignore */ }
                widgetIdRef.current = null;
            }
        };
    }, []);

    return <div ref={containerRef} className={className} />;
}
