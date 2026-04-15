"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTranslations } from "next-intl";
import { ArrowRight, ArrowLeft } from "lucide-react";

const TOTAL_QUESTIONS = 5;

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

interface IntakeChatProps {
    onComplete: (answers: { rant: string; people: string; enjoyments: string; age: string; ethnicity: string }) => void;
    onBack?: () => void;
}

export function IntakeChat({ onComplete, onBack }: IntakeChatProps) {
    const { user, signOut } = useAuth();
    const t = useTranslations();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId] = useState(() => crypto.randomUUID());
    const [questionNumber, setQuestionNumber] = useState(0);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const hasAutoStarted = useRef(false);

    // The current question is always the last assistant message
    const currentQuestion = [...messages].reverse().find(m => m.role === 'assistant')?.content ?? '';

    useEffect(() => {
        if (!isLoading && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isLoading, currentQuestion]);

    // Auto-start: trigger the AI's opening question
    useEffect(() => {
        if (hasAutoStarted.current || !user) return;
        hasAutoStarted.current = true;

        const startIntake = async () => {
            setIsLoading(true);
            const triggerMsg: Message = { id: 'trigger', role: 'user', content: 'start' };

            try {
                const idToken = await user.getIdToken();
                const res = await fetch('/api/intake', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({ messages: [triggerMsg], sessionId }),
                });

                if (res.ok) {
                    const data = await res.json();
                    setMessages([{
                        id: data.message.id,
                        role: 'assistant',
                        content: data.displayContent || data.message.content,
                    }]);
                    setQuestionNumber(1);
                }
            } catch (err) {
                console.error('[IntakeChat] Auto-start failed:', err);
            } finally {
                setIsLoading(false);
            }
        };

        startIntake();
    }, [user, sessionId]);

    const handleSubmit = async () => {
        if (!input.trim() || isLoading || !user) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
        };

        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);
        setInput("");
        setIsLoading(true);

        try {
            const idToken = await user.getIdToken();

            const apiMessages = [
                { id: 'trigger', role: 'user', content: 'start' },
                ...updatedMessages,
            ];

            const res = await fetch('/api/intake', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({ messages: apiMessages, sessionId }),
            });

            if (res.ok) {
                const data = await res.json();
                const assistantMessage: Message = {
                    id: data.message.id,
                    role: 'assistant',
                    content: data.displayContent || data.message.content,
                };
                setMessages(prev => [...prev, assistantMessage]);
                setQuestionNumber(prev => Math.min(prev + 1, TOTAL_QUESTIONS));

                if (data.isComplete) {
                    const userMsgs = updatedMessages.filter(m => m.role === 'user');
                    onComplete({
                        rant: userMsgs[0]?.content || '',
                        people: userMsgs[1]?.content || '',
                        enjoyments: userMsgs[2]?.content || '',
                        age: userMsgs[3]?.content || '',
                        ethnicity: userMsgs[4]?.content || '',
                    });
                }
            }
        } catch (err) {
            console.error('[IntakeChat] Send failed:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleBack = () => {
        if (isLoading || questionNumber <= 1) return;
        // Remove the last assistant message and the last user answer
        const newMessages = [...messages];
        // Pop assistant (last), then user (second to last)
        if (newMessages.length >= 2 && newMessages[newMessages.length - 1].role === 'assistant') {
            newMessages.pop(); // assistant
            newMessages.pop(); // user
        }
        setMessages(newMessages);
        setQuestionNumber(prev => Math.max(prev - 1, 1));
        setInput('');
    };

    const progressPct = questionNumber > 0 ? ((questionNumber - 1) / TOTAL_QUESTIONS) * 100 : 0;

    const questionTitle = questionNumber >= 1 && questionNumber <= TOTAL_QUESTIONS
        ? t(`intake.questionTitle${questionNumber}` as any)
        : '';

    return (
        <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">

            {/* Progress bar */}
            <div className="h-0.5 w-full bg-zinc-900 shrink-0">
                <div
                    className="h-full bg-white transition-all duration-700 ease-out"
                    style={{ width: `${progressPct}%` }}
                />
            </div>

            {/* Header */}
            <div className="shrink-0 px-6 pt-5 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {!isLoading && (
                        questionNumber <= 1 && onBack ? (
                            <button
                                onClick={onBack}
                                className="text-zinc-600 hover:text-white transition-colors p-1 -ml-1"
                            >
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                        ) : questionNumber > 1 ? (
                            <button
                                onClick={handleBack}
                                className="text-zinc-600 hover:text-white transition-colors p-1 -ml-1"
                            >
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                        ) : null
                    )}
                    <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">
                    {questionNumber > 0 && questionNumber <= TOTAL_QUESTIONS
                        ? `${questionNumber} ${t('intake.ofFive')}`
                        : '\u00A0'
                    }
                    </p>
                </div>
                <button
                    onClick={signOut}
                    className="text-xs text-zinc-600 hover:text-white transition-colors uppercase tracking-widest font-semibold"
                >
                    {t('common.signOut')}
                </button>
            </div>

            {/* Question area — top-weighted so textarea + button always visible */}
            <div className="flex-1 flex flex-col px-6 pb-6 min-h-0">
                <div className="w-full max-w-lg mx-auto flex flex-col flex-1 min-h-0">

                    {/* Title + Prompt — scrollable if content is long */}
                    <div className="flex-1 min-h-0 overflow-y-auto pt-4 pb-4">
                        {isLoading && !currentQuestion ? (
                            /* Initial loading — show intro context */
                            <div className="space-y-3 animate-in fade-in duration-500">
                                <p className="text-2xl sm:text-3xl font-semibold text-white leading-snug">
                                    {t('intake.introHeading')}
                                </p>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    {t('intake.introSubtext')}
                                </p>
                                <div className="flex items-center gap-2 pt-2">
                                    <div className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: "0ms" }} />
                                    <div className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: "150ms" }} />
                                    <div className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: "300ms" }} />
                                </div>
                            </div>
                        ) : (
                            <div
                                key={currentQuestion}
                                className="animate-in fade-in slide-in-from-bottom-2 duration-400"
                            >
                                {/* Deterministic title */}
                                {questionTitle && (
                                    <h2 className="text-2xl sm:text-3xl font-semibold text-white leading-snug mb-3">
                                        {questionTitle}
                                    </h2>
                                )}
                                {/* AI prompt as supporting body text */}
                                <p className="text-base text-zinc-400 leading-relaxed">
                                    {currentQuestion}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Input — pinned to bottom, never pushed off screen */}
                    <div className="shrink-0">
                        <div className="relative">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={t('intake.inputPlaceholder')}
                                disabled={isLoading}
                                rows={3}
                                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-2xl px-5 py-4 text-base text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-600 disabled:opacity-40 leading-relaxed transition-colors"
                            />

                            {/* Inline loading indicator while waiting for next question */}
                            {isLoading && currentQuestion && (
                                <div className="absolute bottom-4 left-5 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                                    <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                                </div>
                            )}
                        </div>

                        {/* Submit */}
                        <div className="mt-4 flex justify-end">
                            <button
                                onClick={handleSubmit}
                                disabled={!input.trim() || isLoading}
                                className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-xl text-sm font-bold hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                Continue
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
