"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { CharacterBible, CharacterIdentity } from "@/types/character";
import { Square, RefreshCcw, Target, Globe, Lock, Flame, Loader2, AlertTriangle, ArrowUp, Settings, X, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { subscribeToActiveChat, getMostRecentActiveChat, saveActiveChat, deleteActiveChat } from "@/lib/firebase/chat";
import { Message } from "@ai-sdk/react";
import { DEFAULT_TONE } from "@/lib/ai/engagementTones";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTranslations } from 'next-intl';

type SessionRouting = 'public' | 'private' | 'burn';

const MAX_EXCHANGES = 30;
const MAX_SESSION_HOURS = 2;
const MAX_SESSION_MS = MAX_SESSION_HOURS * 60 * 60 * 1000;

interface MirrorChatProps {
    isOpen: boolean;
    onClose: () => void;
    bible: CharacterBible | null;
    identity?: CharacterIdentity | null;
    uid: string;
    initialContext?: string | null;
    defaultPostRouting?: 'private' | 'community' | 'public';
    isUnlimited?: boolean; // Active subscription (e.g. Archangel) — skip session limits
    onNeedsPurchase?: () => void; // Called when credit consumption fails (no credits left)
}

export function MirrorChat({ isOpen, onClose, bible, identity, uid, initialContext, defaultPostRouting, isUnlimited, onNeedsPurchase }: MirrorChatProps) {
    const { user: authUser } = useAuth();
    const t = useTranslations();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sessionTone] = useState(DEFAULT_TONE);
    const [isRoutingOpen, setIsRoutingOpen] = useState(false);
    const routingRef = useRef<HTMLDivElement>(null);

    // Layout measurement — three-zone keyboard-safe layout
    const headerRef = useRef<HTMLDivElement>(null);
    const inputZoneRef = useRef<HTMLDivElement>(null);
    const [headerHeight, setHeaderHeight] = useState(88);
    const [inputZoneHeight, setInputZoneHeight] = useState(80);

    useEffect(() => {
        if (!isOpen) return;
        const ro = new ResizeObserver(() => {
            if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
            if (inputZoneRef.current) setInputZoneHeight(inputZoneRef.current.offsetHeight);
        });
        if (headerRef.current) ro.observe(headerRef.current);
        if (inputZoneRef.current) ro.observe(inputZoneRef.current);
        // Initial measurement
        if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
        if (inputZoneRef.current) setInputZoneHeight(inputZoneRef.current.offsetHeight);
        return () => ro.disconnect();
    }, [isOpen]);
    const [sessionRouting, setSessionRouting] = useState<SessionRouting>(
        defaultPostRouting === 'private' ? 'private' : 'public'
    );
    const hasManuallySetRouting = useRef(false);
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
    const [planConfirmation, setPlanConfirmation] = useState<string | null>(null);

    // ═══ CHARACTER VOICE (TTS) ═══
    const [autoSpeak, setAutoSpeak] = useState(() => {
        try { return localStorage.getItem('ep-auto-speak') === '1'; } catch { return false; }
    });
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isLoadingTTS, setIsLoadingTTS] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const lastSpokenIdRef = useRef<string | null>(null);
    const voiceId = bible?.voice_id || null;

    // Layer 2: Track whether a credit has been consumed for this session
    const [creditConsumed, setCreditConsumed] = useState(false);

    // Session limits
    const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
    const [isSessionExpired, setIsSessionExpired] = useState(false);

    // Sync sessionRouting when defaultPostRouting prop changes (unless user manually overrode)
    useEffect(() => {
        if (!hasManuallySetRouting.current && defaultPostRouting) {
            setSessionRouting(defaultPostRouting === 'private' ? 'private' : 'public');
        }
    }, [defaultPostRouting]);

    // Derive exchange count from messages
    const exchangeCount = messages.filter(m => m.role === 'user').length;
    const isAtExchangeLimit = exchangeCount >= MAX_EXCHANGES;
    const isSessionLimited = !isUnlimited && (isAtExchangeLimit || isSessionExpired);

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

    // Set session start time on first message
    useEffect(() => {
        if (messages.length > 0 && !sessionStartedAt) {
            setSessionStartedAt(Date.now());
        }
    }, [messages, sessionStartedAt]);


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

            // Layer 2: Register session via consume-session (handles both credits and subscriber daily caps)
            if (!creditConsumed) {
                try {
                    const idToken = await authUser?.getIdToken();
                    const res = await fetch('/api/consume-session', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
                        },
                    });
                    const data = await res.json();

                    if (!data.granted) {
                        onNeedsPurchase?.();
                        return;
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
                    // Network error — proceed, mirror route will re-check
                }
            }

            setMessages(newMessages);
            setIsLoading(true);

            try {
                const idToken = await authUser?.getIdToken();
                await fetch('/api/mirror', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
                    },
                    body: JSON.stringify({
                        sessionId,
                        sessionTone,
                        localTime: new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
                        messages: newMessages,
                    }),
                });
            } catch (err) {
                console.error('Failed to auto-submit signal context:', err);
                setIsLoading(false);
            }
        };

        autoSubmit();
    }, [initialContext, isOpen, sessionId]);

    // Close routing popover on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (routingRef.current && !routingRef.current.contains(e.target as Node)) {
                setIsRoutingOpen(false);
            }
        };
        if (isRoutingOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isRoutingOpen]);

    // Subscribe to active chat in Firestore
    useEffect(() => {
        if (!uid || !isOpen || !sessionId) return;

        const unsubscribe = subscribeToActiveChat(uid, (chat) => {
            if (chat) {
                setMessages(chat.messages || []);
                setIsLoading(chat.status === "generating");
            } else {
                setMessages([]);
                setIsLoading(false);
            }
        }, sessionId);

        return () => unsubscribe();
    }, [uid, isOpen, sessionId]);

    // Watchdog Timer: Protect against indefinite hangs
    useEffect(() => {
        if (!isLoading) return;

        const watchdog = setTimeout(() => {
            console.warn("Watchdog Timer triggered: Chat generation hung. Force stopping.");
            stop();
        }, 130000);

        return () => clearTimeout(watchdog);
    }, [isLoading, sessionId]);



    // Prevent background scrolling when chamber is active (no body jump)
    useEffect(() => {
        if (isOpen) {
            const scrollY = window.scrollY;
            document.body.style.position = 'fixed';
            document.body.style.top = `-${scrollY}px`;
            document.body.style.width = '100%';
        } else {
            const scrollY = Math.abs(parseInt(document.body.style.top || '0', 10));
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            window.scrollTo(0, scrollY);
        }
        return () => {
            const scrollY = Math.abs(parseInt(document.body.style.top || '0', 10));
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            window.scrollTo(0, scrollY);
        };
    }, [isOpen]);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [keyboardOffset, setKeyboardOffset] = useState(0);

    // Track the visual viewport to detect when the software keyboard is open.
    // When the keyboard appears the visual viewport shrinks; the difference
    // between the layout height and the visual height is the keyboard height.
    // We shift the fixed overlay upward by that amount so the input bar stays
    // visible above the keyboard on iOS and Android.
    const updateKeyboardOffset = useCallback(() => {
        if (!window.visualViewport) return;
        const vvHeight = window.visualViewport.height;
        const layoutHeight = window.innerHeight;
        const offset = Math.max(0, layoutHeight - vvHeight - window.visualViewport.offsetTop);
        setKeyboardOffset(offset);
    }, []);

    useEffect(() => {
        if (!isOpen) {
            setKeyboardOffset(0);
            return;
        }
        const vv = window.visualViewport;
        if (!vv) return;
        vv.addEventListener('resize', updateKeyboardOffset);
        vv.addEventListener('scroll', updateKeyboardOffset);
        updateKeyboardOffset();
        return () => {
            vv.removeEventListener('resize', updateKeyboardOffset);
            vv.removeEventListener('scroll', updateKeyboardOffset);
        };
    }, [isOpen, updateKeyboardOffset]);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        autoResizeTextarea(e.target);
    };

    const autoResizeTextarea = (el: HTMLTextAreaElement) => {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (!input.trim() || isLoading || isSessionLimited) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: input.trim()
        };

        const newMessages = [...messages, userMessage];
        const isFirstMessage = messages.length === 0;

        // Layer 2: Register session via consume-session (handles both credits and subscriber daily caps)
        if (isFirstMessage && !creditConsumed) {
            try {
                const idToken = await authUser?.getIdToken();
                const res = await fetch('/api/consume-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
                    },
                });
                const data = await res.json();

                if (!data.granted) {
                    // No credits — send to purchase modal
                    onNeedsPurchase?.();
                    return;
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
        }

        // Optimistic update
        setMessages(newMessages);
        setInput("");
        setIsLoading(true);

        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        try {
            const idToken = await authUser?.getIdToken();
            await fetch('/api/mirror', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
                },
                body: JSON.stringify({
                    sessionId,
                    sessionTone,
                    localTime: new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
                    messages: newMessages
                })
            });
        } catch (err) {
            console.error("Failed to send message to mirror:", err);
            setIsLoading(false);
        }
    };

    const stop = async () => {
        if (!sessionId) return;
        setIsLoading(false);
        try {
            await saveActiveChat(uid, { status: 'idle' }, sessionId);
        } catch (err) {
            console.error("Failed to stop generation:", err);
        }
    };

    const reload = async () => {
        if (!sessionId || isLoading || messages.length === 0) return;

        setIsLoading(true);
        try {
            const idToken = await authUser?.getIdToken();
            await fetch('/api/mirror', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
                },
                body: JSON.stringify({
                    sessionId,
                    sessionTone,
                    localTime: new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
                    messages: messages
                })
            });
        } catch (err) {
            console.error("Failed to reload mirror:", err);
            setIsLoading(false);
        }
    };

    // Character name: user-chosen or AI-generated name is primary; archetype roles are subtitle
    const characterName = bible?.character_name || identity?.character_name || null;
    const characterArchetype = identity?.title || bible?.source_code?.archetype || null;
    const displayName = characterName || characterArchetype || "Your Ideal Self";
    const avatarUrl = bible?.compiled_output?.avatar_url;

    // ═══ TTS — Speak text aloud in the character's voice ═══
    const speakText = async (text: string) => {
        if (!voiceId) return;

        // Stop any currently playing audio
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        // Strip markdown for cleaner speech
        const cleanText = text
            .replace(/[#*_~`>]/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/\n{2,}/g, '. ')
            .replace(/\n/g, ' ')
            .trim()
            .slice(0, 2000);

        if (!cleanText) return;

        setIsLoadingTTS(true);
        setIsSpeaking(true);

        try {
            const idToken = await authUser?.getIdToken();
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
                },
                body: JSON.stringify({ text: cleanText, voiceId }),
            });

            if (!res.ok) throw new Error('TTS failed');

            const audioBlob = await res.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            audio.onended = () => {
                setIsSpeaking(false);
                setIsLoadingTTS(false);
                URL.revokeObjectURL(audioUrl);
                audioRef.current = null;
            };

            audio.onerror = () => {
                setIsSpeaking(false);
                setIsLoadingTTS(false);
                URL.revokeObjectURL(audioUrl);
                audioRef.current = null;
            };

            audioRef.current = audio;
            setIsLoadingTTS(false);
            await audio.play();
        } catch (err) {
            console.error('[TTS] Playback failed:', err);
            setIsSpeaking(false);
            setIsLoadingTTS(false);
        }
    };

    // Auto-speak: when a new assistant message arrives and autoSpeak is on
    useEffect(() => {
        if (!autoSpeak || !voiceId || isLoading) return;

        const lastMsg = messages[messages.length - 1];
        if (!lastMsg || lastMsg.role !== 'assistant') return;
        if (lastMsg.id === lastSpokenIdRef.current) return; // Already spoke this one

        lastSpokenIdRef.current = lastMsg.id;
        speakText(lastMsg.content);
    }, [messages, isLoading, autoSpeak, voiceId]);

    // Stop audio & clean up on toggle off, unmount, or close
    const stopSpeaking = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setIsSpeaking(false);
    };

    useEffect(() => {
        if (!autoSpeak) stopSpeaking();
    }, [autoSpeak]);

    useEffect(() => {
        return () => stopSpeaking();
    }, []);

    const handleExtractDirectives = async () => {
        if (isGeneratingPlan || messages.length < 2) return;
        setIsGeneratingPlan(true);
        setPlanConfirmation(null);

        try {
            const idToken = await authUser?.getIdToken();
            const res = await fetch('/api/mirror/plan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
                },
                body: JSON.stringify({
                            messages,
                            localTime: new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
                        })
            });
            const data = await res.json();
            if (data.success && data.directives?.length > 0) {
                const planMessage = `Here's your plan — ${data.directives.length} directive${data.directives.length !== 1 ? 's' : ''} set:\n\n${data.directives.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n')}\n\nThese are now saved to your directives. Go make it happen.`;
                setMessages(prev => [...prev, { id: `plan-${Date.now()}`, role: 'assistant' as const, content: planMessage }]);
                setPlanConfirmation('✓ Directives saved');
                setTimeout(() => setPlanConfirmation(null), 3000);
            } else {
                setPlanConfirmation(t('mirrorChat.directivesFailed'));
                setTimeout(() => setPlanConfirmation(null), 4000);
            }
        } catch (err) {
            console.error('Failed to extract directives:', err);
            setPlanConfirmation(t('mirrorChat.directivesFailed'));
            setTimeout(() => setPlanConfirmation(null), 4000);
        } finally {
            setIsGeneratingPlan(false);
        }
    };

    const handleClose = async () => {
        const userMessageCount = messages.filter(m => m.role === 'user').length;

        if (sessionId) {
            if (sessionRouting === 'burn') {
                // BURN PROTOCOL: Purge immediately — zero retention
                try {
                    await deleteActiveChat(uid, sessionId);
                } catch (err) {
                    console.error("Burn protocol — failed to purge session:", err);
                }
            } else {
                // Standard close: persist routing preference for the cron job
                saveActiveChat(uid, {
                    isClosed: true,
                    sessionTone,
                    sessionRouting,
                    autoPublish: sessionRouting === 'public', // Legacy compat
                }, sessionId).catch(err => console.error("Failed to close mirror chat:", err));
            }

            // Layer 3: Grace period auto-refund if 0 user messages and credit was consumed
            if (userMessageCount === 0 && creditConsumed) {
                try {
                    const idToken = await authUser?.getIdToken();
                    await fetch('/api/refund-credit', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
                        },
                        body: JSON.stringify({ sessionId }),
                    });
                } catch (err) {
                    console.error('Failed to refund credit:', err);
                }
            }
        }

        // Wipe local state
        setSessionId(null);
        setMessages([]);
        setInput("");
        setIsLoading(false);
        setIsRoutingOpen(false);
        setSessionRouting(defaultPostRouting === 'private' ? 'private' : 'public');
        hasManuallySetRouting.current = false;
        setPlanConfirmation(null);
        setCreditConsumed(false);

        onClose();
    };



    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-50 bg-zinc-950"
                >
                    {/* ═══ ZONE 1: HEADER — always pinned to top ═══ */}
                    <div
                        ref={headerRef}
                        className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-zinc-800/50 bg-zinc-950"
                    >
                        {/* Avatar — prominent face */}
                        <div className="w-16 h-16 rounded-full bg-zinc-800 border-2 border-zinc-700 overflow-hidden flex items-center justify-center shrink-0">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-2xl font-bold text-zinc-400 select-none">
                                    {displayName.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>

                        {/* Character identity */}
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-white text-base leading-tight flex items-center gap-2 truncate">
                                {displayName}
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                            </h3>
                            {characterArchetype && characterName && (
                                <p className="text-xs text-zinc-500 font-medium truncate mt-0.5">{characterArchetype}</p>
                            )}
                        </div>

                        {/* Exchange counter */}
                        {messages.length > 0 && (
                            <span className={cn(
                                "text-[10px] uppercase tracking-widest font-bold shrink-0",
                                exchangeCount >= MAX_EXCHANGES - 5 ? "text-amber-500" : "text-zinc-700"
                            )}>
                                {exchangeCount}/{MAX_EXCHANGES}
                            </span>
                        )}

                        {/* Voice toggle — auto-speak on/off */}
                        {voiceId && (
                            <button
                                onClick={() => {
                                    setAutoSpeak(prev => {
                                        const next = !prev;
                                        try { localStorage.setItem('ep-auto-speak', next ? '1' : '0'); } catch {}
                                        return next;
                                    });
                                }}
                                className={cn(
                                    "shrink-0 w-8 h-8 flex items-center justify-center rounded-full border transition-all",
                                    autoSpeak
                                        ? "text-white border-zinc-500 bg-zinc-800"
                                        : "text-zinc-600 border-zinc-700 hover:text-zinc-400 hover:border-zinc-500",
                                    isSpeaking && "animate-pulse"
                                )}
                                aria-label={autoSpeak ? 'Turn off voice' : 'Turn on voice'}
                            >
                                {autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                            </button>
                        )}

                        {/* Close */}
                        <button
                            onClick={handleClose}
                            className="shrink-0 w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-full transition-colors"
                            aria-label="Close"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* ═══ ZONE 2: MESSAGES — fills space between header and input ═══ */}
                    <div
                        className="absolute left-0 right-0 overflow-y-auto bg-zinc-950 custom-scrollbar"
                        style={{
                            top: headerHeight,
                            bottom: inputZoneHeight + keyboardOffset,
                        }}
                    >
                        <div className="max-w-3xl mx-auto px-5 sm:px-8 lg:px-12 py-6 space-y-3">
                            {messages.length === 0 ? (
                                <div className="h-full min-h-[60vh] flex flex-col items-center justify-center text-center space-y-4 opacity-70">
                                    <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                                        <Lock className="w-8 h-8 text-zinc-500" />
                                    </div>
                                    <div>
                                        <p className="text-zinc-400 mb-2">{t('mirrorChat.connectionSecured')}</p>
                                        <p className="text-sm font-medium text-zinc-300 max-w-xs mx-auto">
                                            {t('mirrorChat.promptFriction')}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                messages.map((m: any, idx: number) => (
                                    <div key={m.id}>
                                        {/* Message bubble — no per-message avatars */}
                                        <div
                                            className={cn(
                                                "flex w-full",
                                                m.role === "user" ? "justify-end" : "justify-start"
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "rounded-2xl px-4 py-3 text-[15px] leading-relaxed max-w-[92%]",
                                                    m.role === "user"
                                                        ? "bg-zinc-800 text-zinc-100 rounded-tr-sm"
                                                        : "bg-zinc-900/60 border border-white/10 text-zinc-100 rounded-tl-sm"
                                                )}
                                            >
                                                {m.role === "assistant" ? (
                                                    <div className="prose prose-invert prose-sm prose-p:leading-relaxed prose-a:text-zinc-200 prose-strong:text-white max-w-none whitespace-pre-wrap">
                                                        <ReactMarkdown>{m.content}</ReactMarkdown>
                                                    </div>
                                                ) : (
                                                    <p className="whitespace-pre-wrap">{m.content}</p>
                                                )}
                                            </div>


                                        </div>

                                        {/* ═══ VOICE WAVEFORM — loading/speaking indicator beneath last assistant msg ═══ */}
                                        {m.role === 'assistant' && idx === messages.length - 1 && (isSpeaking || isLoadingTTS) && (
                                            <div className="flex items-center gap-2 mt-2 pl-1">
                                                <div className="flex items-end gap-[3px] h-4">
                                                    {[0, 1, 2, 3, 4].map(i => (
                                                        <div
                                                            key={i}
                                                            className={cn(
                                                                "w-[3px] rounded-full transition-all",
                                                                isLoadingTTS
                                                                    ? "bg-zinc-600 animate-pulse"
                                                                    : "bg-zinc-400"
                                                            )}
                                                            style={{
                                                                height: isLoadingTTS
                                                                    ? `${6 + (i % 3) * 3}px`
                                                                    : undefined,
                                                                animation: !isLoadingTTS && isSpeaking
                                                                    ? `voiceBar 0.8s ease-in-out ${i * 0.1}s infinite alternate`
                                                                    : undefined,
                                                                animationDelay: isLoadingTTS
                                                                    ? `${i * 150}ms`
                                                                    : undefined,
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                                <span className="text-[10px] text-zinc-600 font-medium tracking-wide">
                                                    {isLoadingTTS ? 'Preparing voice...' : 'Speaking'}
                                                </span>
                                            </div>
                                        )}

                                        {/* ═══ EXTRACT DIRECTIVES — compact chip after last assistant message ═══ */}
                                        {m.role === 'assistant' && idx === messages.length - 1 && !isLoading && messages.length >= 4 && (
                                            <div className="flex justify-end mt-2 pr-1">
                                                {isGeneratingPlan ? (
                                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-bold uppercase tracking-widest px-3 py-1.5">
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                        {t('mirrorChat.extractingDirectives')}
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={handleExtractDirectives}
                                                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 border border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 rounded-full transition-all"
                                                    >
                                                        <Target className="w-3 h-3" />
                                                        {t('mirrorChat.extractDirectives')}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}

                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-zinc-900/60 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5 h-[46px]">
                                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>

                    {/* ═══ ZONE 3: INPUT — pinned above keyboard ═══ */}
                    <div
                        ref={inputZoneRef}
                        className="absolute left-0 right-0 bg-zinc-950 border-t border-zinc-800/50"
                        style={{ bottom: keyboardOffset }}
                    >
                        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 relative">
                            {/* Regenerate Button */}
                            {!isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2">
                                    <button
                                        onClick={reload}
                                        className="text-xs bg-zinc-800 text-zinc-400 px-3 py-1.5 rounded-full flex items-center gap-2 hover:text-white hover:bg-zinc-700 transition-colors shadow-lg border border-zinc-700/50"
                                    >
                                        <RefreshCcw className="w-3 h-3" />
                                        {t('mirrorChat.regenerate')}
                                    </button>
                                </div>
                            )}

                            {/* Plan Confirmation Toast */}
                            <AnimatePresence>
                                {planConfirmation && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 8 }}
                                        className="absolute -top-12 left-1/2 -translate-x-1/2 text-xs bg-zinc-800 text-zinc-200 px-4 py-1.5 rounded-full border border-zinc-700 shadow-lg whitespace-nowrap"
                                    >
                                        {planConfirmation}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* ═══ ROUTING ICON + SETTINGS ═══ */}
                            <div className="flex items-center justify-between mb-2" ref={routingRef}>
                                {/* Routing icon only — no text label */}
                                <div className="flex items-center gap-1.5">
                                    {sessionRouting === 'public' && <Globe className="w-3 h-3 text-zinc-600" />}
                                    {sessionRouting === 'private' && <Lock className="w-3 h-3 text-zinc-600" />}
                                    {sessionRouting === 'burn' && <Flame className="w-3 h-3 text-red-500" />}
                                </div>

                                {/* Settings icon → routing popover */}
                                <div className="relative">
                                    <button
                                        onClick={() => setIsRoutingOpen(prev => !prev)}
                                        className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-zinc-400 transition-colors"
                                        aria-label="Session routing settings"
                                    >
                                        <Settings className="w-3.5 h-3.5" />
                                    </button>

                                    <AnimatePresence>
                                        {isRoutingOpen && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 4, scale: 0.97 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                                                transition={{ duration: 0.15 }}
                                                className="absolute bottom-full right-0 mb-2 z-20 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[220px]"
                                            >
                                                <div className="px-4 pt-3 pb-1">
                                                    <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">{t('mirrorChat.sessionRouting')}</p>
                                                </div>
                                                {(['public', 'private', 'burn'] as SessionRouting[]).map(option => (
                                                    <button
                                                        key={option}
                                                        onClick={() => { setSessionRouting(option); hasManuallySetRouting.current = true; setIsRoutingOpen(false); }}
                                                        className={cn(
                                                            "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                                                            sessionRouting === option
                                                                ? option === 'burn' ? "bg-red-950/40 text-red-400" : "bg-zinc-800 text-white"
                                                                : option === 'burn' ? "text-zinc-500 hover:text-red-400 hover:bg-red-950/20" : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                                                        )}
                                                    >
                                                        {option === 'public' && <Globe className="w-3.5 h-3.5 shrink-0" />}
                                                        {option === 'private' && <Lock className="w-3.5 h-3.5 shrink-0" />}
                                                        {option === 'burn' && <Flame className="w-3.5 h-3.5 shrink-0" />}
                                                        <span>
                                                            {option === 'public' && t('mirrorChat.publicFeed')}
                                                            {option === 'private' && t('mirrorChat.privateLedger')}
                                                            {option === 'burn' && t('mirrorChat.burnOnClose')}
                                                        </span>
                                                        {sessionRouting === option && <span className="ml-auto text-[10px] text-zinc-500">✓</span>}
                                                    </button>
                                                ))}
                                                {/* Burn microcopy */}
                                                {sessionRouting === 'burn' && (
                                                    <p className="text-[10px] text-red-500/70 font-medium tracking-wide px-4 pb-3">
                                                        {t('mirrorChat.burnMicrocopy')}
                                                    </p>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Session limit reached */}
                            {isSessionLimited && (
                                <div className="bg-zinc-900/60 border border-amber-900/30 rounded-xl p-4 mb-3 flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-semibold text-white mb-1">
                                            {isAtExchangeLimit ? t('mirrorChat.sessionComplete') : t('mirrorChat.sessionExpired')}
                                        </p>
                                        <p className="text-xs text-zinc-400">
                                            {isAtExchangeLimit
                                                ? t('mirrorChat.sessionCompleteDesc', { max: MAX_EXCHANGES })
                                                : t('mirrorChat.sessionExpiredDesc', { hours: MAX_SESSION_HOURS })
                                            }
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Textarea + inline send button */}
                            <div className={cn(
                                "relative bg-zinc-900/50 border border-white/10 rounded-xl p-3 transition-all",
                                isSessionLimited
                                    ? "opacity-50 cursor-not-allowed"
                                    : "focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500"
                            )}>
                                <textarea
                                    ref={textareaRef}
                                    className="w-full bg-transparent text-white px-1 pr-12 min-h-[44px] max-h-[120px] resize-none focus:outline-none placeholder:text-zinc-600 custom-scrollbar text-base leading-relaxed"
                                    value={input}
                                    onChange={handleInputChange}
                                    placeholder={isSessionLimited ? t('mirrorChat.placeholderEnded') : t('mirrorChat.placeholderDefault')}
                                    disabled={isSessionLimited}
                                    onFocus={() => {
                                        // Visual viewport listener handles keeping
                                        // the input visible; no manual scroll needed.
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            if (input.trim() && !isLoading && !isSessionLimited) {
                                                handleSubmit();
                                            }
                                        }
                                    }}
                                    rows={1}
                                />

                                {/* Send / Stop — absolute inside textarea wrapper */}
                                <div className="absolute right-3 bottom-3">
                                    {isLoading ? (
                                        <button
                                            onClick={stop}
                                            className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-400 hover:border-red-800 transition-colors"
                                            aria-label="Stop"
                                        >
                                            <Square className="w-3.5 h-3.5 fill-current" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleSubmit()}
                                            disabled={!input.trim()}
                                            className={cn(
                                                "w-9 h-9 rounded-full flex items-center justify-center transition-all",
                                                input.trim()
                                                    ? "bg-white text-black shadow-lg hover:bg-zinc-200"
                                                    : "bg-zinc-800/80 text-zinc-600 cursor-not-allowed"
                                            )}
                                            aria-label="Send"
                                        >
                                            <ArrowUp className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
