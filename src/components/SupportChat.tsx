"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle, X, ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTranslations } from "next-intl";

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

interface SupportChatProps {
    isOpen?: boolean;
    onClose?: () => void;
    standalone?: boolean;
}

export function SupportChat({ isOpen: controlledOpen, onClose, standalone = false }: SupportChatProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = standalone ? internalOpen : (controlledOpen ?? false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const { user } = useAuth();
    const t = useTranslations('supportChat');

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleSend = async () => {
        const text = input.trim();
        if (!text || isLoading) return;

        setInput('');
        const userMessage: Message = { role: 'user', content: text };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            // Include auth header if logged in
            if (user) {
                const idToken = await user.getIdToken();
                headers['Authorization'] = `Bearer ${idToken}`;
            }

            const res = await fetch('/api/support', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    message: text,
                    history: messages.slice(-10),
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
            } else if (res.status === 429) {
                setMessages(prev => [...prev, { role: 'assistant', content: t('errorTooMany') }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: t('errorWrong') }]);
            }
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: t('errorReach') }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* Standalone floating button (landing page only) */}
            {standalone && !isOpen && (
                <button
                    onClick={() => setInternalOpen(true)}
                    className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-zinc-900 border border-zinc-700 shadow-lg flex items-center justify-center hover:bg-zinc-800 hover:border-zinc-600 transition-all group"
                    aria-label="Open support chat"
                >
                    <HelpCircle className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                </button>
            )}

            {/* Chat panel */}
            {isOpen && (
                <div className="fixed bottom-6 right-6 z-[60] w-[360px] max-w-[calc(100vw-48px)] h-[480px] max-h-[calc(100vh-120px)] bg-[#0a0a0a] border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 bg-black/50">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs font-bold uppercase tracking-[0.15em] text-zinc-400">
                                {t('title')}
                            </span>
                        </div>
                        <button
                            onClick={() => { standalone ? setInternalOpen(false) : onClose?.(); }}
                            className="text-zinc-600 hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-center px-4">
                                <HelpCircle className="w-8 h-8 text-zinc-700 mb-3" />
                                <p className="text-xs text-zinc-500 leading-relaxed">
                                    {t('emptyState')}
                                </p>
                            </div>
                        )}
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                                    msg.role === 'user'
                                        ? "ml-auto bg-zinc-800 text-white"
                                        : "mr-auto bg-zinc-900 text-zinc-300 border border-zinc-800/50"
                                )}
                            >
                                {msg.content}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="mr-auto bg-zinc-900 border border-zinc-800/50 rounded-xl px-3 py-2">
                                <Loader2 className="w-3 h-3 text-zinc-500 animate-spin" />
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="px-3 py-2 border-t border-zinc-800/50 bg-black/30">
                        <div className="flex items-center gap-2">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder={t('placeholder')}
                                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                                disabled={isLoading}
                            />
                            <button
                                onClick={handleSend}
                                disabled={isLoading || !input.trim()}
                                className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center hover:bg-zinc-700 transition-colors disabled:opacity-30"
                            >
                                <ArrowUp className="w-3.5 h-3.5 text-white" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
