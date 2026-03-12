"use client";

import React, { useEffect, useRef, useState } from "react";
import { CharacterBible } from "@/types/character";
import { User, Shield, Square, RefreshCcw, ChevronDown, Target, Globe, Lock, Flame, Loader2, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { subscribeToActiveChat, getMostRecentActiveChat, saveActiveChat, deleteActiveChat } from "@/lib/firebase/chat";
import { Message } from "@ai-sdk/react";
import { SessionTone } from "@/types/chat";
import { ENGAGEMENT_TONES, DEFAULT_TONE } from "@/lib/ai/engagementTones";
import { useAuth } from "@/lib/auth/AuthContext";

type SessionRouting = 'public' | 'private' | 'burn';
type ModelTier = 'opus' | 'sonnet';

interface MirrorChatProps {
    isOpen: boolean;
    onClose: () => void;
    bible: CharacterBible | null;
    uid: string;
    initialContext?: string | null;
    defaultPostRouting?: 'public' | 'private';
}

export function MirrorChat({ isOpen, onClose, bible, uid, initialContext, defaultPostRouting }: MirrorChatProps) {
    const { user: authUser } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sessionTone, setSessionTone] = useState<SessionTone>(DEFAULT_TONE);
    const [isToneOpen, setIsToneOpen] = useState(false);
    const toneRef = useRef<HTMLDivElement>(null);
    const [sessionRouting, setSessionRouting] = useState<SessionRouting>(
        defaultPostRouting === 'private' ? 'private' : 'public'
    );
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
    const [planConfirmation, setPlanConfirmation] = useState<string | null>(null);
    const [modelTier, setModelTier] = useState<ModelTier>('opus');

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
                        modelTier,
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

    // Close tone dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (toneRef.current && !toneRef.current.contains(e.target as Node)) {
                setIsToneOpen(false);
            }
        };
        if (isToneOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isToneOpen]);

    // Subscribe to active chat in Firestore
    useEffect(() => {
        if (!uid || !isOpen || !sessionId) return;

        const unsubscribe = subscribeToActiveChat(uid, (chat) => {
            if (chat) {
                setMessages(chat.messages || []);
                setIsLoading(chat.status === "generating");
                if (chat.sessionTone) setSessionTone(chat.sessionTone);
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

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        autoResizeTextarea(e.target);
    };

    const autoResizeTextarea = (el: HTMLTextAreaElement) => {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: input.trim()
        };

        const newMessages = [...messages, userMessage];

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
                    modelTier,
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
                    modelTier,
                    localTime: new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
                    messages: messages
                })
            });
        } catch (err) {
            console.error("Failed to reload mirror:", err);
            setIsLoading(false);
        }
    };

    const idealName = bible?.source_code?.archetype || "Your Ideal Self";
    const avatarUrl = bible?.compiled_output?.avatar_url;

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
                body: JSON.stringify({ messages })
            });
            const data = await res.json();
            if (data.success && data.directives?.length > 0) {
                const planMessage = `Here's your plan — ${data.directives.length} directive${data.directives.length !== 1 ? 's' : ''} set:\n\n${data.directives.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n')}\n\nThese are now saved to your directives. Go make it happen.`;
                setMessages(prev => [...prev, { id: `plan-${Date.now()}`, role: 'assistant' as const, content: planMessage }]);
                setPlanConfirmation('✓ Directives saved');
                setTimeout(() => setPlanConfirmation(null), 3000);
            } else {
                setPlanConfirmation('Failed to extract directives. Try again.');
                setTimeout(() => setPlanConfirmation(null), 4000);
            }
        } catch (err) {
            console.error('Failed to extract directives:', err);
            setPlanConfirmation('Failed to extract directives.');
            setTimeout(() => setPlanConfirmation(null), 4000);
        } finally {
            setIsGeneratingPlan(false);
        }
    };

    const handleClose = async () => {
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
        }

        // Wipe local state
        setSessionId(null);
        setMessages([]);
        setInput("");
        setIsLoading(false);
        setSessionTone(DEFAULT_TONE);
        setIsToneOpen(false);
        setSessionRouting(defaultPostRouting === 'private' ? 'private' : 'public');
        setPlanConfirmation(null);

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
                    className="fixed inset-0 z-50 w-screen h-screen bg-zinc-950 flex flex-col"
                >
                    {/* ═══ PINNED HEADER ═══ */}
                    <div className="flex items-center justify-between px-5 sm:px-8 py-4 border-b border-zinc-800/50 bg-zinc-950 z-10 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-zinc-800 border-2 border-zinc-700 overflow-hidden flex items-center justify-center relative">
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt={idealName} className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-5 h-5 text-zinc-400" />
                                )}
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-2">
                                    {idealName}
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                </h3>
                                <p className="text-xs text-zinc-500 font-medium">Consulting The Mirror</p>
                            </div>
                        </div>
                        <button
                            onClick={handleClose}
                            className="text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-white border border-zinc-700 hover:border-zinc-500 px-4 py-2 transition-colors"
                        >
                            Close
                        </button>
                    </div>

                    {/* ═══ TONE SELECTOR + MODEL TOGGLE ═══ */}
                    <div className="px-5 sm:px-8 py-2 border-b border-zinc-800/30 bg-zinc-950/60 shrink-0">
                        <div className="max-w-3xl mx-auto flex items-center justify-between">
                            <div className="relative" ref={toneRef}>
                                <button
                                    onClick={() => setIsToneOpen(!isToneOpen)}
                                    className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors group"
                                >
                                    <span className="uppercase tracking-widest font-bold text-[10px] text-zinc-600">Mode</span>
                                    <span className="text-zinc-100 font-medium">{ENGAGEMENT_TONES[sessionTone].label}</span>
                                    <ChevronDown className={cn("w-3 h-3 transition-transform", isToneOpen && "rotate-180")} />
                                </button>

                                <AnimatePresence>
                                    {isToneOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -4 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute top-full left-0 mt-1.5 z-20 bg-zinc-950 border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[260px]"
                                        >
                                            {(Object.entries(ENGAGEMENT_TONES) as [SessionTone, typeof ENGAGEMENT_TONES[SessionTone]][]).map(([key, tone]) => (
                                                <button
                                                    key={key}
                                                    onClick={() => {
                                                        setSessionTone(key);
                                                        setIsToneOpen(false);
                                                        if (sessionId) {
                                                            saveActiveChat(uid, { sessionTone: key }, sessionId).catch(err => console.error("Failed to save tone:", err));
                                                        }
                                                    }}
                                                    className={cn(
                                                        "w-full text-left px-4 py-2.5 flex flex-col gap-0.5 transition-colors",
                                                        key === sessionTone
                                                            ? "bg-zinc-800/60 border-l-2 border-white"
                                                            : "hover:bg-zinc-800/50 border-l-2 border-transparent"
                                                    )}
                                                >
                                                    <span className={cn(
                                                        "text-sm font-medium",
                                                        key === sessionTone ? "text-zinc-100" : "text-zinc-300"
                                                    )}>
                                                        {tone.label}
                                                    </span>
                                                    <span className="text-sm text-zinc-400">{tone.description}</span>
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* ═══ MODEL TIER TOGGLE ═══ */}
                            <button
                                onClick={() => setModelTier(prev => prev === 'opus' ? 'sonnet' : 'opus')}
                                className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold transition-colors hover:text-zinc-300"
                            >
                                <Cpu className="w-3 h-3" />
                                <span className={modelTier === 'opus' ? 'text-zinc-300' : 'text-emerald-400'}>
                                    {modelTier === 'opus' ? 'Opus' : 'Sonnet'}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* ═══ READING ZONE ═══ */}
                    <div className="flex-1 overflow-y-auto bg-zinc-950 custom-scrollbar scroll-smooth">
                        <div className="max-w-3xl mx-auto px-5 sm:px-8 lg:px-12 py-6 space-y-3">
                            {messages.length === 0 ? (
                                <div className="h-full min-h-[60vh] flex flex-col items-center justify-center text-center space-y-4 opacity-70">
                                    <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                                        <Shield className="w-8 h-8 text-zinc-500" />
                                    </div>
                                    <div>
                                        <p className="text-zinc-400 mb-2">Connection secured.</p>
                                        <p className="text-sm font-medium text-zinc-300 max-w-xs mx-auto">
                                            &quot;Detail your current friction.&quot;
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                messages.map((m: any, idx: number) => (
                                    <div key={m.id}>
                                        <div
                                            className={cn(
                                                "flex w-full",
                                                m.role === "user" ? "justify-end" : "justify-start"
                                            )}
                                        >
                                            <div className={cn("flex gap-3 max-w-[85%]", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
                                                <div className="shrink-0 mt-1">
                                                    {m.role === "user" ? (
                                                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 border border-zinc-700">
                                                            <User className="w-4 h-4" />
                                                        </div>
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 border border-zinc-700 overflow-hidden">
                                                            {avatarUrl ? (
                                                                <img src={avatarUrl} alt={idealName} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <User className="w-4 h-4 text-zinc-400" />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <div
                                                    className={cn(
                                                        "rounded-2xl px-5 py-4 text-[15px] leading-relaxed",
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
                                        </div>

                                        {/* ═══ EXTRACT DIRECTIVES — contextual, after last assistant message ═══ */}
                                        {m.role === 'assistant' && idx === messages.length - 1 && !isLoading && messages.length >= 4 && (
                                            <div className="flex justify-start mt-3 ml-11">
                                                {isGeneratingPlan ? (
                                                    <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium uppercase tracking-wider px-5 py-2.5">
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        Extracting directives...
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={handleExtractDirectives}
                                                        className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-5 py-2.5 transition-all border bg-white text-black border-transparent hover:bg-zinc-200 shadow-lg"
                                                    >
                                                        <Target className="w-3.5 h-3.5" />
                                                        Extract 24-Hour Directives
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}

                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="flex gap-3 max-w-[85%]">
                                        <div className="shrink-0 mt-1">
                                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                                                <div className="w-2 h-2 rounded-full bg-zinc-400 animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5 h-[46px]">
                                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                                            <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>

                    {/* ═══ INPUT ZONE ═══ */}
                    <div className="bg-zinc-950 border-t border-zinc-800/50 shrink-0">
                        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 relative">
                            {/* Regenerate Button */}
                            {!isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2">
                                    <button
                                        onClick={reload}
                                        className="text-xs bg-zinc-800 text-zinc-400 px-3 py-1.5 rounded-full flex items-center gap-2 hover:text-white hover:bg-zinc-700 transition-colors shadow-lg border border-zinc-700/50"
                                    >
                                        <RefreshCcw className="w-3 h-3" />
                                        Regenerate Response
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

                            {/* ═══ SESSION ROUTING BAR ═══ */}
                            <div className="flex items-center gap-3 mb-3 flex-wrap">
                                <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-600 shrink-0">
                                    Session Routing:
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => setSessionRouting('public')}
                                        className={cn(
                                            "flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1.5 border transition-all",
                                            sessionRouting === 'public'
                                                ? "bg-zinc-800 text-white border-zinc-600"
                                                : "bg-transparent text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-600"
                                        )}
                                    >
                                        <Globe className="w-3 h-3" />
                                        Public Feed
                                    </button>
                                    <button
                                        onClick={() => setSessionRouting('private')}
                                        className={cn(
                                            "flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1.5 border transition-all",
                                            sessionRouting === 'private'
                                                ? "bg-zinc-800 text-zinc-400 border-zinc-600"
                                                : "bg-transparent text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-600"
                                        )}
                                    >
                                        <Lock className="w-3 h-3" />
                                        Private Ledger
                                    </button>
                                    <button
                                        onClick={() => setSessionRouting('burn')}
                                        className={cn(
                                            "flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1.5 border transition-all",
                                            sessionRouting === 'burn'
                                                ? "bg-red-950/60 text-red-400 border-red-800/40"
                                                : "bg-transparent text-zinc-500 border-zinc-800 hover:text-red-400/70 hover:border-red-900/50"
                                        )}
                                    >
                                        <Flame className="w-3 h-3" />
                                        Burn on Close
                                    </button>
                                </div>
                            </div>

                            {/* Burn microcopy */}
                            <AnimatePresence>
                                {sessionRouting === 'burn' && (
                                    <motion.p
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="text-[10px] text-red-500/70 font-medium tracking-wide mb-3 overflow-hidden"
                                    >
                                        Zero retention. Erased immediately upon exit.
                                    </motion.p>
                                )}
                            </AnimatePresence>

                            {/* Textarea */}
                            <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-3 focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500 transition-all">
                                <textarea
                                    ref={textareaRef}
                                    className="w-full bg-transparent text-white px-1 min-h-[44px] max-h-[200px] resize-none focus:outline-none placeholder:text-zinc-600 custom-scrollbar text-[15px] leading-relaxed"
                                    value={input}
                                    onChange={handleInputChange}
                                    placeholder="State your friction..."
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            if (input.trim() && !isLoading) {
                                                handleSubmit();
                                            }
                                        }
                                    }}
                                    rows={1}
                                />
                            </div>

                            {/* Commit / Stop — separated from textarea */}
                            <div className="flex items-center justify-between mt-3">
                                <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">
                                    Encrypted & Private
                                </span>

                                {isLoading ? (
                                    <button
                                        onClick={stop}
                                        className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-5 py-2.5 bg-zinc-800 text-zinc-400 hover:text-red-500 hover:bg-zinc-900 border border-zinc-700 transition-colors"
                                    >
                                        <Square className="w-3.5 h-3.5 fill-current" />
                                        Stop
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleSubmit()}
                                        disabled={!input.trim()}
                                        className={cn(
                                            "flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-5 py-2.5 border transition-all",
                                            input.trim()
                                                ? "bg-white text-black border-transparent hover:bg-zinc-200 shadow-lg"
                                                : "bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed"
                                        )}
                                    >
                                        Commit
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
