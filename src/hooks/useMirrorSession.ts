"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";
import { subscribeToActiveChat, getMostRecentActiveChat, saveActiveChat, deleteActiveChat } from "@/lib/firebase/chat";
import { authFetch } from "@/lib/auth/authFetch";
import type { Message, SessionRouting } from "@/types/chat";

// Mirror Chat runs on Cloud Functions; the reply is written to Firestore and
// rendered from the active-chat subscription. High-effort replies can take minutes.
const mirrorReply = httpsCallable(functions, 'mirrorReply', { timeout: 540_000 });

export const MAX_EXCHANGES = 30;
export const MAX_SESSION_HOURS = 2;
const MAX_SESSION_MS = MAX_SESSION_HOURS * 60 * 60 * 1000;

/** The user's local time, as sent to the Mirror functions. */
export function mirrorLocalTime(): string {
    return new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

interface UseMirrorSessionOptions {
    uid: string;
    isOpen: boolean;
    authUser: User | null | undefined;
    locale: string;
    initialContext?: string | null;
    sessionRouting: SessionRouting;
    onClose: () => void;
}

export function useMirrorSession({ uid, isOpen, authUser, locale, initialContext, sessionRouting, onClose }: UseMirrorSessionOptions) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [postPhotoUrl, setPostPhotoUrl] = useState<string | null>(null);

    // Layer 2: Track whether a credit has been consumed for this session
    const [creditConsumed, setCreditConsumed] = useState(false);

    // Session limits
    const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
    const [isSessionExpired, setIsSessionExpired] = useState(false);

    // Derive exchange count from messages
    const exchangeCount = messages.filter(m => m.role === 'user').length;
    const isAtExchangeLimit = exchangeCount >= MAX_EXCHANGES;
    const isSessionLimited = isAtExchangeLimit || isSessionExpired;

    // Session timer — check expiry every 30 seconds
    useEffect(() => {
        if (!sessionStartedAt || !isOpen) return;
        const check = () => {
            if (Date.now() - sessionStartedAt >= MAX_SESSION_MS) {
                setIsSessionExpired(true);
            }
        };
        check();
        const interval = setInterval(check, 30000);
        return () => clearInterval(interval);
    }, [sessionStartedAt, isOpen]);

    // Initialize or Resume Session
    useEffect(() => {
        if (!uid || !isOpen) return;

        const initSession = async () => {
            const recentChat = await getMostRecentActiveChat(uid);
            if (recentChat) {
                setSessionId(recentChat.id);
            } else {
                setSessionId(crypto.randomUUID());
            }
        };

        if (!sessionId) {
            initSession();
        }
    }, [uid, isOpen, sessionId]);

    // Layer 2: Register session via consume-session (handles both credits and subscriber daily caps).
    // Returns false when access was refused and the chat has been closed.
    const consumeSession = async (): Promise<boolean> => {
        try {
            const init: RequestInit = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            };
            const res = authUser
                ? await authFetch(authUser, '/api/consume-session', init)
                : await fetch('/api/consume-session', init);
            const data = await res.json();

            if (!data.granted) {
                // Daily limit reached — close chat
                onClose();
                return false;
            }

            setCreditConsumed(true);
            // Mark session as credit-consumed in Firestore, and persist routing preference
            if (sessionId) {
                saveActiveChat(uid, {
                    creditConsumed: true,
                    sessionRouting,
                    autoPublish: sessionRouting === 'public',
                }, sessionId).catch(() => {});
            }
        } catch {
            // Network error — proceed, mirror route will re-check access
        }
        return true;
    };

    const requestReply = (replyMessages: Message[]) => mirrorReply({
        sessionId,
        localTime: mirrorLocalTime(),
        messages: replyMessages,
        locale,
    });

    // Auto-submit initial context from Signal card CTA
    useEffect(() => {
        if (!initialContext || !isOpen || !sessionId || messages.length > 0 || isLoading) return;

        const autoSubmit = async () => {
            const userMessage: Message = {
                id: Date.now().toString(),
                role: 'user',
                content: initialContext,
            };
            const newMessages = [userMessage];

            if (!creditConsumed && !(await consumeSession())) return;

            setMessages(newMessages);
            setIsLoading(true);

            try {
                await requestReply(newMessages);
            } catch (err) {
                console.error('Failed to auto-submit signal context:', err);
                setIsLoading(false);
            }
        };

        autoSubmit();
    }, [initialContext, isOpen, sessionId]);

    // Subscribe to active chat in Firestore
    useEffect(() => {
        if (!uid || !isOpen || !sessionId) return;

        const unsubscribe = subscribeToActiveChat(uid, (chat) => {
            if (chat) {
                setMessages(chat.messages || []);
                setIsLoading(chat.status === "generating");
                if (chat.user_photo_url) {
                    setPostPhotoUrl(chat.user_photo_url);
                }
                // Restore session start time from Firestore so the 2-hour timer
                // survives close/reopen without resetting.
                if (chat.createdAt && !sessionStartedAt) {
                    setSessionStartedAt(chat.createdAt);
                }
            } else {
                setMessages([]);
                setIsLoading(false);
            }
        }, sessionId);

        return () => unsubscribe();
    }, [uid, isOpen, sessionId]);

    const stop = async () => {
        if (!sessionId) return;
        setIsLoading(false);
        try {
            await saveActiveChat(uid, { status: 'idle' }, sessionId);
        } catch (err) {
            console.error("Failed to stop generation:", err);
        }
    };

    // Watchdog Timer: Protect against indefinite hangs
    useEffect(() => {
        if (!isLoading) return;

        const watchdog = setTimeout(() => {
            console.warn("Watchdog Timer triggered: Chat generation hung. Force stopping.");
            stop();
        }, 130000);

        return () => clearTimeout(watchdog);
    }, [isLoading, sessionId]);

    const reload = async () => {
        if (!sessionId || isLoading || messages.length === 0) return;

        setIsLoading(true);
        try {
            await requestReply(messages);
        } catch (err) {
            console.error("Failed to reload mirror:", err);
            setIsLoading(false);
        }
    };

    const removePhoto = async () => {
        setPostPhotoUrl(null);
        if (sessionId) {
            await saveActiveChat(uid, { user_photo_url: null }, sessionId);
        }
    };

    // BURN PROTOCOL: Purge immediately — zero retention
    const burnSession = async () => {
        if (!sessionId) return;
        try {
            await deleteActiveChat(uid, sessionId);
            setPostPhotoUrl(null);
        } catch (err) {
            console.error("Burn protocol — failed to purge session:", err);
        }
    };

    // Standard close: persist routing preference for the cron job
    const persistClose = () => {
        if (!sessionId) return;
        const closeReason = isAtExchangeLimit ? 'exchange-limit' as const
            : isSessionExpired ? 'expired' as const
            : 'user' as const;
        saveActiveChat(uid, {
            isClosed: true,
            sessionRouting,
            closeReason,
            autoPublish: sessionRouting === 'public', // Legacy compat
        }, sessionId).catch(err => console.error("Failed to close mirror chat:", err));
    };

    const resetSession = () => {
        setSessionId(null);
        setMessages([]);
        setIsLoading(false);
        setCreditConsumed(false);
        setPostPhotoUrl(null);
        setSessionStartedAt(null);
        setIsSessionExpired(false);
    };

    return {
        messages,
        setMessages,
        isLoading,
        setIsLoading,
        sessionId,
        postPhotoUrl,
        creditConsumed,
        exchangeCount,
        isAtExchangeLimit,
        isSessionLimited,
        consumeSession,
        requestReply,
        stop,
        reload,
        removePhoto,
        burnSession,
        persistClose,
        resetSession,
    };
}
