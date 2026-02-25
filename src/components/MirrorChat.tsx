"use client";

import React, { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { CharacterBible } from "@/types/character";
import { X, Send, User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";

interface MirrorChatProps {
    isOpen: boolean;
    onClose: () => void;
    bible: CharacterBible | null;
    uid: string;
}

export function MirrorChat({ isOpen, onClose, bible, uid }: MirrorChatProps) {
    // Load initial messages from localStorage
    const [initialMessages] = useState(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem(`mirror-chat-${uid}`);
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) {
                    return [];
                }
            }
        }
        return [];
    });

    const { messages, setMessages, input, handleInputChange, handleSubmit, isLoading } = useChat({
        api: '/api/mirror',
        body: { uid },
        initialMessages,
    });

    // Save messages to localStorage whenever they change
    useEffect(() => {
        if (typeof window !== "undefined") {
            if (messages.length > 0) {
                localStorage.setItem(`mirror-chat-${uid}`, JSON.stringify(messages));
            } else {
                localStorage.removeItem(`mirror-chat-${uid}`);
            }
        }
    }, [messages, uid]);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of chat
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isOpen]);

    // Prevent background scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "auto";
            setMessages([]); // Clear chat history on explicit close
            if (typeof window !== "undefined") {
                localStorage.removeItem(`mirror-chat-${uid}`);
            }
        }
        return () => {
            document.body.style.overflow = "auto";
        };
    }, [isOpen, setMessages, uid]);

    const idealName = bible?.source_code?.archetype || "Your Ideal Self";
    const avatarUrl = bible?.compiled_bible?.avatar_url;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
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
                                <div className="w-10 h-10 rounded-full bg-zinc-800 border-2 border-emerald-500/30 overflow-hidden flex items-center justify-center relative">
                                    {avatarUrl ? (
                                        <img src={avatarUrl} alt={idealName} className="w-full h-full object-cover" />
                                    ) : (
                                        <Sparkles className="w-5 h-5 text-emerald-400" />
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
                                onClick={onClose}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth">
                            {messages.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-70">
                                    <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                                        <Sparkles className="w-8 h-8 text-emerald-500/50" />
                                    </div>
                                    <div>
                                        <p className="text-zinc-400 mb-2">You are speaking to your created potential.</p>
                                        <p className="text-sm font-medium text-emerald-400/80 max-w-xs mx-auto">
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
                                                    <div className="w-8 h-8 rounded-full bg-emerald-950/50 flex items-center justify-center text-emerald-400 border border-emerald-900/50 overflow-hidden">
                                                        {avatarUrl ? (
                                                            <img src={avatarUrl} alt={idealName} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Sparkles className="w-4 h-4" />
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div
                                                className={cn(
                                                    "rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
                                                    m.role === "user"
                                                        ? "bg-zinc-800 text-zinc-100 rounded-tr-sm"
                                                        : "bg-emerald-950/20 border border-emerald-900/30 text-emerald-50 rounded-tl-sm shadow-inner shadow-emerald-900/10"
                                                )}
                                            >
                                                {m.role === "assistant" ? (
                                                    <div className="prose prose-invert prose-sm prose-p:leading-relaxed prose-a:text-emerald-400 prose-strong:text-emerald-300 max-w-none whitespace-pre-wrap">
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

                            {isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
                                <div className="flex justify-start">
                                    <div className="flex gap-3 max-w-[85%]">
                                        <div className="shrink-0 mt-1">
                                            <div className="w-8 h-8 rounded-full bg-emerald-950/50 flex items-center justify-center border border-emerald-900/50">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5 h-[46px]">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-zinc-950 border-t border-zinc-800/50 shrink-0">
                            <form
                                onSubmit={handleSubmit}
                                className="relative flex items-end gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-2 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/50 transition-all"
                            >
                                <textarea
                                    className="w-full bg-transparent text-white px-3 py-2 -my-2 min-h-[44px] max-h-32 resize-none focus:outline-none placeholder:text-zinc-600 custom-scrollbar mt-0.5"
                                    value={input}
                                    onChange={handleInputChange}
                                    placeholder={`Tell ${idealName} your situation...`}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            if (input.trim() && !isLoading) {
                                                handleSubmit(e as any);
                                            }
                                        }
                                    }}
                                    rows={1}
                                />
                                <button
                                    type="submit"
                                    disabled={!input.trim() || isLoading}
                                    className="shrink-0 w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white flex items-center justify-center transition-colors mb-0.5"
                                >
                                    <Send className="w-4 h-4 ml-0.5" />
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
