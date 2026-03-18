"use client";

import React, { useState, useEffect } from "react";
import { X, Bell, CheckCircle2, Circle, Sparkles, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { CharacterProfile } from "@/types/character";
import { useTranslations } from "next-intl";

interface DirectivesMenuProps {
    isOpen: boolean;
    onClose: () => void;
    profile: CharacterProfile | null;
}

export function DirectivesMenu({ isOpen, onClose, profile }: DirectivesMenuProps) {
    const { user } = useAuth();
    const [isUpdating, setIsUpdating] = useState(false);
    const [pendingCompleteId, setPendingCompleteId] = useState<string | null>(null);
    const [unexpectedText, setUnexpectedText] = useState("");
    const [isSubmittingShift, setIsSubmittingShift] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const t = useTranslations('directivesMenu');

    // Close on escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) {
                if (pendingCompleteId) {
                    setPendingCompleteId(null);
                    setUnexpectedText("");
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose, pendingCompleteId]);

    const activeTodos = profile?.active_todos || [];

    const pendingTodo = pendingCompleteId ? activeTodos.find(t => t.id === pendingCompleteId) : null;

    const completeDirective = async (todoId: string, yieldText?: string) => {
        if (!profile?.uid || isUpdating) return;
        setIsUpdating(true);

        try {
            const updatedTodos = activeTodos.map(todo => {
                if (todo.id === todoId) {
                    return {
                        ...todo,
                        completed: true,
                        ...(yieldText ? { unexpected_yield: yieldText } : {}),
                    };
                }
                return todo;
            });

            await updateDoc(doc(db, "users", profile.uid), {
                active_todos: updatedTodos
            });

            // Fire-and-forget: create Reality Shift post in background (don't block UI)
            if (yieldText?.trim() && user) {
                const directiveTitle = activeTodos.find(t => t.id === todoId)?.task || "Unknown";
                user.getIdToken().then(idToken => {
                    fetch("/api/posts/reality-shift", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${idToken}`,
                        },
                        body: JSON.stringify({
                            directiveTitle,
                            unexpectedYield: yieldText.trim(),
                        }),
                    }).catch(err => console.error("Failed to create Reality Shift post:", err));
                });
            }
        } catch (error) {
            console.error("Error completing directive:", error);
        } finally {
            setIsUpdating(false);
            setIsSubmittingShift(false);
            setPendingCompleteId(null);
            setUnexpectedText("");
        }
    };

    const handleTodoClick = (todoId: string, currentStatus: boolean) => {
        if (currentStatus) {
            // Un-completing — instant, no prompt
            handleUncomplete(todoId);
        } else {
            // Completing — show prompt
            setPendingCompleteId(todoId);
            setUnexpectedText("");
        }
    };

    const handleUncomplete = async (todoId: string) => {
        if (!profile?.uid || isUpdating) return;
        setIsUpdating(true);
        try {
            const updatedTodos = activeTodos.map(todo => {
                if (todo.id === todoId) {
                    const { unexpected_yield, ...rest } = todo as any;
                    return { ...rest, completed: false };
                }
                return todo;
            });
            await updateDoc(doc(db, "users", profile.uid), {
                active_todos: updatedTodos
            });
        } catch (error) {
            console.error("Error uncompleting directive:", error);
        } finally {
            setIsUpdating(false);
        }
    };

    const deleteDirective = async (todoId: string) => {
        if (!profile?.uid || isUpdating) return;
        setDeletingId(todoId);
        try {
            const updatedTodos = activeTodos.filter(todo => todo.id !== todoId);
            await updateDoc(doc(db, "users", profile.uid), {
                active_todos: updatedTodos
            });
        } catch (error) {
            console.error("Error deleting directive:", error);
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm transition-opacity"
                    onClick={onClose}
                />
            )}

            {/* Slide-over Panel */}
            <div
                className={cn(
                    "fixed inset-y-0 right-0 w-full sm:w-96 h-full bg-zinc-950 border-l border-zinc-800 shadow-2xl z-[101] flex flex-col transform transition-transform duration-300 ease-in-out",
                    isOpen ? "translate-x-0" : "translate-x-full"
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-900">
                    <div className="flex items-center gap-2">
                        <Bell className="w-5 h-5 text-zinc-300" />
                        <h2 className="text-sm font-bold tracking-widest uppercase text-zinc-100">{t('title')}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-500 hover:text-zinc-200 transition-colors rounded-full hover:bg-zinc-900"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Completion Prompt Overlay */}
                    {pendingTodo ? (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                            {/* What's being completed */}
                            <div className="flex items-center gap-2 mb-4">
                                <CheckCircle2 className="w-4 h-4 text-zinc-100" />
                                <span className="text-[10px] tracking-[0.2em] uppercase text-zinc-100">{t('completing')}</span>
                            </div>
                            <div className="text-base text-zinc-100 mb-6 leading-snug">
                                {pendingTodo.task}
                            </div>

                            {/* The Prompt */}
                            <div className="mb-4">
                                <label className="text-xs tracking-widest uppercase text-zinc-400 mb-2 block">
                                    {t('question')}
                                </label>
                                <textarea
                                    value={unexpectedText}
                                    onChange={(e) => setUnexpectedText(e.target.value)}
                                    placeholder={t('placeholder')}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-base text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none resize-none min-h-[100px] transition-colors"
                                />
                                <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
                                    {t('description')}
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => completeDirective(pendingTodo.id, unexpectedText.trim() || undefined)}
                                    disabled={isUpdating || isSubmittingShift}
                                    className="w-full flex items-center justify-center gap-2 bg-white text-black px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-zinc-200 transition-colors disabled:opacity-50"
                                >
                                    {isSubmittingShift ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {t('logging')}
                                        </>
                                    ) : unexpectedText.trim() ? (
                                        <>
                                            <Sparkles className="w-4 h-4" />
                                            {t('completeAndLog')}
                                        </>
                                    ) : (
                                        t('markComplete')
                                    )}
                                </button>
                                <button
                                    onClick={() => {
                                        setPendingCompleteId(null);
                                        setUnexpectedText("");
                                    }}
                                    className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-2 transition-colors"
                                >
                                    {t('cancel')}
                                </button>
                            </div>
                        </div>
                    ) : activeTodos.length === 0 ? (
                        <div className="text-center py-12 text-zinc-600 text-xs font-mono uppercase tracking-widest border border-dashed border-zinc-800 rounded-xl">
                            {t('noDirectives')}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {activeTodos.map((todo) => (
                                <button
                                    key={todo.id}
                                    onClick={() => handleTodoClick(todo.id, todo.completed)}
                                    disabled={isUpdating || deletingId === todo.id}
                                    className={cn(
                                        "w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all duration-200 group",
                                        todo.completed
                                            ? "bg-zinc-900/40 border-zinc-800/50"
                                            : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-600",
                                        deletingId === todo.id && "opacity-50"
                                    )}
                                >
                                    <div className="mt-0.5 shrink-0">
                                        {todo.completed ? (
                                            <CheckCircle2 className="w-4 h-4 text-zinc-100" />
                                        ) : (
                                            <Circle className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                                        )}
                                    </div>
                                    <div className={cn(
                                        "text-sm leading-snug flex-1 min-w-0",
                                        todo.completed ? "text-zinc-600 line-through" : "text-zinc-300"
                                    )}>
                                        {todo.task}
                                    </div>
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteDirective(todo.id);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.stopPropagation();
                                                deleteDirective(todo.id);
                                            }
                                        }}
                                        className="mt-0.5 shrink-0 p-1 text-zinc-700 active:text-red-500 sm:hover:text-red-500 transition-colors rounded-md"
                                        title={t('deleteDirective')}
                                    >
                                        {deletingId === todo.id ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-3.5 h-3.5" />
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-zinc-900 bg-black/20">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest text-center">
                        {t('footer')}
                    </div>
                </div>
            </div>
        </>
    );
}
