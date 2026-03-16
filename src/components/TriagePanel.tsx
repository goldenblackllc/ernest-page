"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils";
import { MessageCircle, Home, User as UserIcon, BookOpen, Heart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterBible } from "@/types/character";
import { MirrorChat } from "./MirrorChat";
import { SessionPurchaseModal } from "./SessionPurchaseModal";

const MAX_SESSIONS_PER_DAY = 5;

export function TriagePanel() {
    const { user } = useAuth();
    const pathname = usePathname();

    const [isMirrorOpen, setIsMirrorOpen] = useState(false);
    const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
    const [isDailyCapHit, setIsDailyCapHit] = useState(false);
    const [initialContext, setInitialContext] = useState<string | null>(null);

    // Data for Mirror Chat
    const [bible, setBible] = useState<CharacterBible | null>(null);
    const [defaultPostRouting, setDefaultPostRouting] = useState<'public' | 'private'>('public');

    // Session credit / subscription state
    const [sessionCredits, setSessionCredits] = useState<number>(0);
    const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
    const [sessionsToday, setSessionsToday] = useState<number>(0);

    useEffect(() => {
        if (!user) return;
        const unsubscribe = subscribeToCharacterProfile(user.uid, (data) => {
            setBible(data.character_bible);
            setDefaultPostRouting(data.default_post_routing || 'public');
            setSessionCredits(data.session_credits || 0);

            // Daily session count
            const today = new Date().toISOString().split('T')[0];
            setSessionsToday(data.sessions_today_date === today ? (data.sessions_today || 0) : 0);

            // Check subscription
            const sub = data.subscription;
            if (sub?.status === 'active' && sub?.subscribedUntil) {
                setHasActiveSubscription(new Date(sub.subscribedUntil) > new Date());
            } else {
                setHasActiveSubscription(false);
            }
        });
        return () => unsubscribe();
    }, [user]);

    // Listen for 30-day check-in card tap
    useEffect(() => {
        const handleCheckin = (e: any) => {
            const context = e.detail?.context;
            if (context) {
                setInitialContext(context);
                attemptStartSession();
            }
        };
        window.addEventListener('open-mirror-checkin', handleCheckin);
        return () => window.removeEventListener('open-mirror-checkin', handleCheckin);
    }, [hasActiveSubscription, sessionCredits, sessionsToday]);

    const canChat = hasActiveSubscription || sessionCredits > 0;
    const dailyRemaining = MAX_SESSIONS_PER_DAY - sessionsToday;

    const attemptStartSession = async () => {
        if (bible?.status === 'compiling') return;

        // No credits and no subscription → purchase modal
        if (!canChat) {
            setIsPurchaseOpen(true);
            return;
        }

        // Call consume-session for EVERYONE — it enforces daily cap + credit decrement
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch('/api/consume-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
                },
            });
            const data = await res.json();

            if (data.dailyLimit) {
                setIsDailyCapHit(true);
                setTimeout(() => setIsDailyCapHit(false), 5000);
                return;
            }

            if (!data.granted) {
                setIsPurchaseOpen(true);
                return;
            }

            setIsMirrorOpen(true);
        } catch {
            // Network error — try opening anyway, server will catch on next API call
            setIsMirrorOpen(true);
        }
    };

    const handlePurchaseComplete = async () => {
        // After purchase, consume a credit and open the chat
        try {
            const idToken = await user?.getIdToken();
            const res = await fetch('/api/consume-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
                },
            });
            const data = await res.json();
            if (data.dailyLimit) {
                setIsDailyCapHit(true);
                setTimeout(() => setIsDailyCapHit(false), 5000);
                return;
            }
        } catch {
            // Proceed — Firestore listener will update credits
        }
        setIsMirrorOpen(true);
    };

    return (
        <>
            {/* BOTTOM NAV BAR */}
            <div className="fixed bottom-0 left-0 w-full z-40 bg-black/90 backdrop-blur-md border-t border-zinc-800 pb-safe">
                <div className="max-w-md mx-auto px-8 h-16 flex items-center justify-between relative">
                    <Link href="/" className={cn("p-2 transition-colors", pathname === "/" ? "text-white" : "text-zinc-500 hover:text-white")}>
                        <Home className="w-6 h-6" />
                    </Link>
                    <Link href="/my-posts" className={cn("p-2 transition-colors", pathname === "/my-posts" ? "text-white" : "text-zinc-500 hover:text-white")}>
                        <BookOpen className="w-6 h-6" />
                    </Link>
                    {/* Spacer for center FAB */}
                    <div className="w-16" />
                    <Link href="/saved" className={cn("p-2 transition-colors", pathname === "/saved" ? "text-white" : "text-zinc-500 hover:text-white")}>
                        <Heart className="w-6 h-6" />
                    </Link>
                    <Link href="/profile" className={cn("p-2 transition-colors", pathname === "/profile" ? "text-white" : "text-zinc-500 hover:text-white")}>
                        <UserIcon className="w-6 h-6" />
                    </Link>
                </div>
            </div>

            {/* FAB — Opens Mirror Chat or Purchase Modal */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
                <button
                    onClick={attemptStartSession}
                    disabled={bible?.status === 'compiling'}
                    className={cn(
                        "w-16 h-16 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex items-center justify-center transition-all duration-300 ring-4 ring-black",
                        bible?.status === 'compiling'
                            ? "bg-zinc-700 text-zinc-500 cursor-not-allowed opacity-60"
                            : "bg-white text-black hover:scale-110 active:scale-95"
                    )}
                    title={
                        bible?.status === 'compiling'
                            ? 'Compiling your Blueprint...'
                            : canChat ? 'Open chat' : 'Purchase a session'
                    }
                >
                    <MessageCircle className={cn("w-7 h-7", bible?.status === 'compiling' && "animate-pulse")} />
                </button>

                {/* Badge: credits or daily remaining */}
                {canChat && (
                    <span className={cn(
                        "mt-1 text-[10px] font-bold uppercase tracking-widest",
                        dailyRemaining <= 1 ? "text-amber-500" : "text-zinc-500"
                    )}>
                        {hasActiveSubscription
                            ? `${dailyRemaining} today`
                            : `${sessionCredits} session${sessionCredits !== 1 ? 's' : ''}`
                        }
                    </span>
                )}

                {/* Daily cap toast */}
                {isDailyCapHit && (
                    <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-zinc-900 border border-amber-900/30 text-amber-400 text-xs font-semibold px-4 py-2.5 rounded-xl whitespace-nowrap shadow-lg animate-in fade-in slide-in-from-bottom-2">
                        Daily limit reached — go do the work.
                    </div>
                )}
            </div>

            {/* Mirror Chat Modal */}
            <MirrorChat
                isOpen={isMirrorOpen}
                onClose={() => { setIsMirrorOpen(false); setInitialContext(null); }}
                bible={bible}
                uid={user?.uid || ""}
                initialContext={initialContext}
                defaultPostRouting={defaultPostRouting}
                isUnlimited={hasActiveSubscription}
            />

            {/* Session Purchase Modal */}
            <SessionPurchaseModal
                isOpen={isPurchaseOpen}
                onClose={() => setIsPurchaseOpen(false)}
                onPurchased={handlePurchaseComplete}
            />
        </>
    );
}
