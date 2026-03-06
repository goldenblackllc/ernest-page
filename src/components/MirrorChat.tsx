"use client";

import React, { useEffect, useRef, useState } from "react";
import { CharacterBible } from "@/types/character";
import { X, Send, User, Sparkles, Square, RefreshCcw, ChevronDown, Target, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { subscribeToActiveChat, getMostRecentActiveChat, saveActiveChat } from "@/lib/firebase/chat";
import { Message } from "@ai-sdk/react";
import { SessionTone } from "@/types/chat";
import { ENGAGEMENT_TONES, DEFAULT_TONE } from "@/lib/ai/engagementTones";

interface MirrorChatProps {
    isOpen: boolean;
    onClose: () => void;
    bible: CharacterBible | null;
    uid: string;
    initialContext?: string | null;
}

export function MirrorChat({ isOpen, onClose, bible, uid, initialContext }: MirrorChatProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sessionTone, setSessionTone] = useState<SessionTone>(DEFAULT_TONE);
    const [isToneOpen, setIsToneOpen] = useState(false);
    const toneRef = useRef<HTMLDivElement>(null);
    const [autoPublish, setAutoPublish] = useState(true);
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
    const [planConfirmation, setPlanConfirmation] = useState<string | null>(null);

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
                await fetch('/api/mirror', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        uid,
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
        if (!uid || !isOpen || !sessionId) return; // Only subscribe when open and session is ready

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

        // If the loading state persists for 130 seconds, automatically stop it
        const watchdog = setTimeout(() => {
            console.warn("Watchdog Timer triggered: Chat generation hung. Force stopping.");
            stop();
        }, 130000);

        return () => clearTimeout(watchdog);
    }, [isLoading, sessionId]);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of chat
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen, isLoading]);

    // Prevent background scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "auto";
        }
        return () => {
            document.body.style.overflow = "auto";
        };
    }, [isOpen]);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        autoResizeTextarea(e.target);
    };

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const autoResizeTextarea = (el: HTMLTextAreaElement) => {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 132)}px`; // ~6 lines max
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

        try {
            await fetch('/api/mirror', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid,
                    sessionId,
                    sessionTone,
                    localTime: new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
                    messages: newMessages
                })
            });
            // The background process will update Firestore, which UI listens to
        } catch (err) {
            console.error("Failed to send message to mirror:", err);
            setIsLoading(false);
        }
    };

    const stop = async () => {
        if (!sessionId) return;
        setIsLoading(false);
        // Transition the chat back to idle in Firestore to unlock the UI globally
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
            await fetch('/api/mirror', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid,
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

    const idealName = bible?.source_code?.archetype || "Your Ideal Self";
    const avatarUrl = bible?.compiled_output?.avatar_url;

    const handleGeneratePlan = async () => {
        if (isGeneratingPlan || messages.length < 2) return;
        setIsGeneratingPlan(true);
        setPlanConfirmation(null);

        try {
            const res = await fetch('/api/mirror/plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid, messages })
            });
            const data = await res.json();
            if (data.success && data.directives?.length > 0) {
                // Inject the plan as a formatted assistant message in the chat
                const planMessage = `Here's your plan — ${data.directives.length} directive${data.directives.length !== 1 ? 's' : ''} set:\n\n${data.directives.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n')}\n\nThese are now saved to your directives. Go make it happen.`;
                setMessages(prev => [...prev, { id: `plan-${Date.now()}`, role: 'assistant' as const, content: planMessage }]);
                setPlanConfirmation('✓ Plan saved');
                setTimeout(() => setPlanConfirmation(null), 3000);
            } else {
                setPlanConfirmation('Failed to generate plan. Try again.');
                setTimeout(() => setPlanConfirmation(null), 4000);
            }
        } catch (err) {
            console.error('Failed to generate plan:', err);
            setPlanConfirmation('Failed to generate plan.');
            setTimeout(() => setPlanConfirmation(null), 4000);
        } finally {
            setIsGeneratingPlan(false);
        }
    };

    const handleClose = () => {
        if (sessionId) {
            // Pass autoPublish preference to the chat session — the cron job reads this
            // to decide whether to generate a public post from this conversation
            saveActiveChat(uid, { isClosed: true, sessionTone, autoPublish }, sessionId).catch(err => console.error("Failed to close mirror chat:", err));
        }

        // Wipe local state
        setSessionId(null);
        setMessages([]);
        setInput("");
        setIsLoading(false);
        setSessionTone(DEFAULT_TONE);
        setIsToneOpen(false);
        setAutoPublish(true);
        setPlanConfirmation(null);

        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-2xl h-[85vh] sm:h-[80vh] bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-md z-10 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-zinc-800 border-2 border-zinc-700 overflow-hidden flex items-center justify-center relative">
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt={idealName} className="w-full h-full object-cover" />
                                    ) : (
                                        <Sparkles className="w-5 h-5 text-zinc-400" />
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
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Tone Selector */}
                        <div className="px-4 py-2 border-b border-zinc-800/30 bg-zinc-950/60 shrink-0">
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
                                            className="absolute top-full left-0 mt-1.5 z-20 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden min-w-[220px]"
                                        >
                                            {(Object.entries(ENGAGEMENT_TONES) as [SessionTone, typeof ENGAGEMENT_TONES[SessionTone]][]).map(([key, tone]) => (
                                                <button
                                                    key={key}
                                                    onClick={() => {
                                                        setSessionTone(key);
                                                        setIsToneOpen(false);
                                                        // Persist tone change immediately
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
                                                        key === sessionTone ? "text-white" : "text-zinc-300"
                                                    )}>
                                                        {tone.label}
                                                    </span>
                                                    <span className="text-[11px] text-zinc-500">{tone.description}</span>
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth">
                            {messages.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-70">
                                    <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                                        <Sparkles className="w-8 h-8 text-zinc-500" />
                                    </div>
                                    <div>
                                        <p className="text-zinc-400 mb-2">You are speaking to your created potential.</p>
                                        <p className="text-sm font-medium text-zinc-300 max-w-xs mx-auto">
                                            "What current limitation are you facing?"
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                messages.map((m: any) => (
                                    <div
                                        key={m.id}
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
                                                            <Sparkles className="w-4 h-4 text-zinc-400" />
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div
                                                className={cn(
                                                    "rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
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

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-zinc-950 border-t border-zinc-800/50 shrink-0 relative">
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

                            {/* Action Bar: Generate Plan + Auto-Publish Toggle */}
                            {messages.length >= 1 && (
                                <div className="flex items-center justify-between mb-3">
                                    <button
                                        onClick={handleGeneratePlan}
                                        disabled={isGeneratingPlan || isLoading}
                                        className={cn(
                                            "flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full transition-all border",
                                            isGeneratingPlan
                                                ? "bg-zinc-800 text-zinc-400 border-zinc-700 animate-pulse"
                                                : "bg-white text-black border-transparent hover:bg-zinc-200 shadow-lg"
                                        )}
                                    >
                                        <Target className="w-3.5 h-3.5" />
                                        {isGeneratingPlan ? 'Generating...' : 'Give Me A Plan'}
                                    </button>

                                    <button
                                        onClick={() => setAutoPublish(!autoPublish)}
                                        className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                                    >
                                        {autoPublish ? (
                                            <>
                                                <Globe className="w-3 h-3 text-zinc-400" />
                                                <span className="text-zinc-400 hover:text-zinc-200 transition-colors">Publish on Close</span>
                                            </>
                                        ) : (
                                            <>
                                                <Lock className="w-3 h-3 text-zinc-500" />
                                                <span>Private Session</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            <form
                                onSubmit={handleSubmit}
                                className="relative flex items-end gap-2 bg-zinc-900/50 border border-white/10 rounded-2xl p-2 focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500 transition-all"
                            >
                                <textarea
                                    ref={textareaRef}
                                    className="w-full bg-transparent text-white px-3 py-2 -my-2 min-h-[44px] max-h-[132px] resize-none focus:outline-none placeholder:text-zinc-600 custom-scrollbar mt-0.5"
                                    value={input}
                                    onChange={handleInputChange}
                                    placeholder={`Tell ${idealName} your situation...`}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            if (input.trim() && !isLoading) {
                                                handleSubmit();
                                                if (textareaRef.current) {
                                                    textareaRef.current.style.height = 'auto';
                                                }
                                            }
                                        }
                                    }}
                                    rows={1}
                                />
                                <button
                                    type={isLoading ? "button" : "submit"}
                                    onClick={isLoading ? stop : undefined}
                                    disabled={!input.trim() && !isLoading}
                                    className={cn(
                                        "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors mb-0.5",
                                        isLoading
                                            ? "bg-zinc-800 text-zinc-400 hover:text-red-500 hover:bg-zinc-900 border border-zinc-700"
                                            : "bg-white hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-600 border border-transparent text-black"
                                    )}
                                >
                                    {isLoading ? <Square className="w-4 h-4 fill-current" /> : <Send className="w-4 h-4 ml-0.5" />}
                                </button>
                            </form>
                            <div className="text-center mt-3">
                                <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">
                                    Encrypted & Private
                                </span>
                            </div>
                        </div>

                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
