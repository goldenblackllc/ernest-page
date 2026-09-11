"use client";

import React, { useState, useMemo } from "react";
import { CheckCircle2, Circle, X, Plus } from "lucide-react";
import { WantItem } from "@/types/character";
import { cn } from "@/lib/utils";

export interface WantsEditorProps {
    wants: WantItem[];
    onSave: (wants: WantItem[]) => void;
    className?: string;
}

/**
 * Checklist editor for "What I Want".
 * Displays wants items with completed items sorted to the bottom,
 * allows toggling completion status, deleting items, and adding new items.
 */
export function WantsEditor({ wants = [], onSave, className }: WantsEditorProps) {
    const [inputValue, setInputValue] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");

    // Unchecked items show first, then checked items at bottom
    const sortedWants = useMemo(() => {
        const list = Array.isArray(wants) ? wants : [];
        const unchecked = list.filter((item) => !item.completed);
        const checked = list.filter((item) => item.completed);
        return [...unchecked, ...checked];
    }, [wants]);

    // Tap circle to toggle completed status
    const handleToggle = (id: string) => {
        const list = Array.isArray(wants) ? wants : [];
        const updated = list.map((item) =>
            item.id === id ? { ...item, completed: !item.completed } : item
        );
        onSave(updated);
    };

    // Delete item from list
    const handleDelete = (id: string) => {
        const list = Array.isArray(wants) ? wants : [];
        const updated = list.filter((item) => item.id !== id);
        onSave(updated);
    };

    // Start editing an item
    const startEditing = (item: WantItem) => {
        setEditingId(item.id);
        setEditValue(item.text);
    };

    // Save edit
    const saveEdit = () => {
        if (!editingId) return;
        const trimmed = editValue.trim();
        if (!trimmed) {
            // If emptied, delete it
            handleDelete(editingId);
        } else {
            const list = Array.isArray(wants) ? wants : [];
            const updated = list.map((item) =>
                item.id === editingId ? { ...item, text: trimmed } : item
            );
            onSave(updated);
        }
        setEditingId(null);
        setEditValue("");
    };

    // Add new item on enter/submit
    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        const text = inputValue.trim();
        if (!text) return;

        const newItem: WantItem = {
            id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            text,
            completed: false,
            created_at: Date.now(),
        };

        const list = Array.isArray(wants) ? wants : [];
        onSave([...list, newItem]);
        setInputValue("");
    };

    return (
        <div className={cn("flex flex-col h-full min-h-0", className)}>
            {/* Title */}
            <div className="pb-4 shrink-0">
                <h2 className="text-xl font-bold text-white">What I Want</h2>
            </div>

            {/* Top input */}
            <form onSubmit={handleAdd} className="pb-3 shrink-0">
                <div className="relative flex items-center">
                    <button
                        type="submit"
                        disabled={!inputValue.trim()}
                        className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500 hover:text-white disabled:hover:text-zinc-500 transition-colors"
                        aria-label="Add want"
                        tabIndex={-1}
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Add a want..."
                        className="w-full bg-zinc-800/50 rounded-lg border border-zinc-700/50 pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-colors"
                    />
                </div>
            </form>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto min-h-0">
                {sortedWants.length === 0 ? (
                    <div className="py-8 text-center text-zinc-500 text-sm">
                        No wants yet. Add your first want below.
                    </div>
                ) : (
                    sortedWants.map((item) => (
                        <div
                            key={item.id}
                            className="flex items-center justify-between gap-3 py-3 border-b border-zinc-800/50 group"
                        >
                            {/* Checkbox and Text */}
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <button
                                    type="button"
                                    onClick={() => handleToggle(item.id)}
                                    className="shrink-0 p-0.5 text-zinc-400 hover:text-white transition-colors focus:outline-none"
                                    aria-label={item.completed ? `Mark "${item.text}" as incomplete` : `Mark "${item.text}" as complete`}
                                >
                                    {item.completed ? (
                                        <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
                                    ) : (
                                        <Circle className="w-5 h-5 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0" />
                                    )}
                                </button>
                                {editingId === item.id ? (
                                    <input
                                        type="text"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onBlur={saveEdit}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
                                            if (e.key === "Escape") { setEditingId(null); setEditValue(""); }
                                        }}
                                        autoFocus
                                        className="flex-1 bg-zinc-800/50 rounded border border-amber-500/50 px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                                    />
                                ) : (
                                    <span
                                        onClick={() => startEditing(item)}
                                        className={cn(
                                            "text-sm break-words flex-1 cursor-pointer select-none transition-colors",
                                            item.completed ? "text-zinc-500 line-through" : "text-white"
                                        )}
                                        title="Tap to edit"
                                    >
                                        {item.text}
                                    </span>
                                )}
                            </div>

                            {/* Delete button */}
                            <button
                                type="button"
                                onClick={() => handleDelete(item.id)}
                                className="shrink-0 p-1 text-zinc-600 hover:text-red-400 transition-colors rounded focus:outline-none"
                                aria-label={`Delete "${item.text}"`}
                                title="Delete"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default WantsEditor;
