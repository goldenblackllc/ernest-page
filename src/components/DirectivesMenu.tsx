"use client";

import React, { useState, useEffect } from "react";
import { X, Bell, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { CharacterProfile } from "@/types/character";

interface DirectivesMenuProps {
    isOpen: boolean;
    onClose: () => void;
    profile: CharacterProfile | null;
}

export function DirectivesMenu({ isOpen, onClose, profile }: DirectivesMenuProps) {
    const [isUpdating, setIsUpdating] = useState(false);

    // Close on escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isOpen) onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    const activeTodos = profile?.active_todos || [];

    const handleToggleTodo = async (todoId: string, currentStatus: boolean) => {
        if (!profile?.uid || isUpdating) return;
        setIsUpdating(true);

        try {
            const updatedTodos = activeTodos.map(todo => {
                if (todo.id === todoId) {
                    return { ...todo, completed: !currentStatus };
                }
                return todo;
            });

            await updateDoc(doc(db, "users", profile.uid), {
                active_todos: updatedTodos
            });
        } catch (error) {
            console.error("Error toggling directive:", error);
        } finally {
            setIsUpdating(false);
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
                    <div className="flex items-center gap-2 text-white">
                        <Bell className="w-5 h-5 text-emerald-500" />
                        <h2 className="text-sm font-bold tracking-widest uppercase">My Daily Plan</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-500 hover:text-white transition-colors rounded-full hover:bg-zinc-900"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {activeTodos.length === 0 ? (
                        <div className="text-center py-12 text-zinc-600 text-xs font-mono uppercase tracking-widest border border-dashed border-zinc-800 rounded-xl">
                            No Active Directives
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {activeTodos.map((todo) => (
                                <button
                                    key={todo.id}
                                    onClick={() => handleToggleTodo(todo.id, todo.completed)}
                                    disabled={isUpdating}
                                    className={cn(
                                        "w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-200 group relative overflow-hidden",
                                        todo.completed
                                            ? "bg-zinc-900/40 border-zinc-800/50"
                                            : "bg-zinc-900 border-zinc-700 hover:border-emerald-500/50"
                                    )}
                                >
                                    <div className="mt-0.5 shrink-0">
                                        {todo.completed ? (
                                            <CheckCircle2 className="w-5 h-5 text-emerald-500/50" />
                                        ) : (
                                            <Circle className="w-5 h-5 text-zinc-500 group-hover:text-emerald-500/70 transition-colors" />
                                        )}
                                    </div>
                                    <div className={cn(
                                        "text-sm leading-snug font-medium",
                                        todo.completed ? "text-zinc-600 line-through" : "text-zinc-200"
                                    )}>
                                        {todo.task}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-zinc-900 bg-black/20">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest text-center">
                        My Daily Plan generated during Check-in
                    </div>
                </div>
            </div>
        </>
    );
}
