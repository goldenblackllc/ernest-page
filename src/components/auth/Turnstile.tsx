"use client";

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
    /** Called with true when Cloudflare shows its checkbox, false once it's done. */
    onInteractive?: (shown: boolean) => void;
    theme?: 'light' | 'dark' | 'auto';
    /** Our locale (en, es, pt, fr, de); the widget's own text follows it. */
    locale?: string;
    className?: string;
}

// Turnstile's language codes, where they differ from our locales
const TURNSTILE_LANGUAGE: Record<string, string> = { pt: 'pt-br' };

export default function Turnstile({ onVerify, onExpire, onInteractive, theme = 'auto', locale, className }: TurnstileProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const onVerifyRef = useRef(onVerify);
    const onExpireRef = useRef(onExpire);
    const onInteractiveRef = useRef(onInteractive);

    // Keep callback refs current without re-triggering the effect
    useEffect(() => {
        onVerifyRef.current = onVerify;
        onExpireRef.current = onExpire;
        onInteractiveRef.current = onInteractive;
    });

    const renderWidget = useCallback(() => {
        const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
        if (!siteKey || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current !== null) return; // already rendered

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            callback: (token: string) => onVerifyRef.current(token),
            'expired-callback': () => onExpireRef.current?.(),
            'before-interactive-callback': () => onInteractiveRef.current?.(true),
            'after-interactive-callback': () => onInteractiveRef.current?.(false),
            theme,
            language: locale ? (TURNSTILE_LANGUAGE[locale] ?? locale) : 'auto',
            size: 'flexible',
            appearance: 'interaction-only',
        });
    }, [theme, locale]);

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
