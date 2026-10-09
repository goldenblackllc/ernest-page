"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";
import { subscribeToActiveChat, getMostRecentActiveChat, saveActiveChat, deleteActiveChat } from "@/lib/firebase/chat";
import { authFetch } from "@/lib/auth/authFetch";
import type { Message, SessionRouting } from "@/types/chat";
import { SESSION_LIMITS, SESSION_MS } from "@functions/lib/access/sessionAccess";

// Mirror Chat runs on Cloud Functions; the reply is written to Firestore and
// rendered from the active-chat subscription. High-effort replies can take minutes.
const mirrorReply = httpsCallable(functions, 'mirrorReply', { timeout: 540_000 });

// The server enforces the same limits (functions/src/lib/access/sessionAccess.ts).
export const MAX_EXCHANGES = SESSION_LIMITS.turnsPerSession;
export const MAX_SESSION_HOURS = SESSION_LIMITS.sessionHours;
const MAX_SESSION_MS = SESSION_MS;

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

    // Start the session on the server (membership, free session or credit). mirrorReply
    // refuses sessions that weren't started. Returns false when access was refused
    // and the chat has been closed.
    const consumeSession = async (): Promise<boolean> => {
        if (!sessionId || !authUser) return false;
        try {
            const res = await authFetch(authUser, '/api/consume-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId }),
            });
            const data = await res.json();

            if (!data.granted) {
                // Daily limit reached or nothing left to pay with — close chat
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
            // Network error — proceed; mirrorReply refuses if the session didn't start
        }
        return true;
    };

    const requestReply = (replyMessages: Message[]) => mirrorReply({
        sessionId,
        localTime: mirrorLocalTime(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
                // Restore session start time from Firestore so the session timer
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
