'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Heart, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LovesEditorProps {
    interests: string[];
    onSave: (interests: string[]) => void;
}

export function LovesEditor({ interests = [], onSave }: LovesEditorProps) {
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editingValue, setEditingValue] = useState('');
    const [newInterest, setNewInterest] = useState('');

    const editInputRef = useRef<HTMLInputElement>(null);
    const isCancelingRef = useRef(false);
    const isSubmittingRef = useRef(false);

    // Auto-focus and select text when entering inline edit mode
    useEffect(() => {
        if (editingIndex !== null && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [editingIndex]);

    const handleStartEdit = (index: number, value: string) => {
        setEditingIndex(index);
        setEditingValue(value);
    };

    const handleSaveEdit = () => {
        if (editingIndex === null || isCancelingRef.current || isSubmittingRef.current) {
            return;
        }
        isSubmittingRef.current = true;

        const currentIdx = editingIndex;
        const trimmed = editingValue.trim();

        if (trimmed.length > 0) {
            if (trimmed !== interests[currentIdx]) {
                const updated = [...interests];
                updated[currentIdx] = trimmed;
                onSave(updated);
            }
        } else {
            // Remove the item if emptied out during edit
            const updated = interests.filter((_, idx) => idx !== currentIdx);
            onSave(updated);
        }

        setEditingIndex(null);
        setEditingValue('');

        setTimeout(() => {
            isSubmittingRef.current = false;
        }, 0);
    };

    const handleCancelEdit = () => {
        isCancelingRef.current = true;
        setEditingIndex(null);
        setEditingValue('');

        setTimeout(() => {
            isCancelingRef.current = false;
        }, 0);
    };

    const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancelEdit();
        }
    };

    const handleDelete = (indexToDelete: number) => {
        if (editingIndex === indexToDelete) {
            setEditingIndex(null);
            setEditingValue('');
        } else if (editingIndex !== null && editingIndex > indexToDelete) {
            setEditingIndex(editingIndex - 1);
        }

        const updated = interests.filter((_, idx) => idx !== indexToDelete);
        onSave(updated);
    };

    const handleAddNew = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newInterest.trim();
        if (!trimmed) return;

        const updated = [...interests, trimmed];
        onSave(updated);
        setNewInterest('');
    };

    return (
        <div className="flex flex-col h-full w-full">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4 shrink-0">
                <Heart className="w-5 h-5 text-amber-400 shrink-0" />
                <h2 className="text-xl font-bold text-white">What I Love</h2>
            </div>

            {/* Add Input */}
            <form onSubmit={handleAddNew} className="relative flex items-center mb-3 shrink-0">
                <Plus className="absolute left-3 w-4 h-4 text-zinc-500 pointer-events-none" />
                <input
                    type="text"
                    value={newInterest}
                    onChange={(e) => setNewInterest(e.target.value)}
                    placeholder="Add something you love..."
                    className={cn(
                        "w-full bg-zinc-800/50 rounded-lg border border-zinc-700/50",
                        "text-white placeholder-zinc-500 text-sm",
                        "pl-9 pr-4 py-2.5",
                        "focus:outline-none focus:border-amber-400/80 focus:ring-1 focus:ring-amber-400/50",
                        "transition-all duration-150"
                    )}
                />
            </form>

            {/* Scrollable Interest List */}
            <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                {interests.length === 0 ? (
                    <div className="py-8 text-center text-sm text-zinc-500">
                        No interests added yet. Add what you love below.
                    </div>
                ) : (
                    interests.map((interest, index) => {
                        const isEditing = editingIndex === index;

                        return (
                            <div
                                key={index}
                                className="flex items-center justify-between py-2.5 px-1 border-b border-zinc-800/50 group transition-colors"
                            >
                                {isEditing ? (
                                    <input
                                        ref={editInputRef}
                                        type="text"
                                        value={editingValue}
                                        onChange={(e) => setEditingValue(e.target.value)}
                                        onKeyDown={handleEditKeyDown}
                                        onBlur={handleSaveEdit}
                                        className={cn(
                                            "flex-1 bg-zinc-800/80 text-white text-sm sm:text-base",
                                            "px-2.5 py-1 rounded border border-zinc-700",
                                            "focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40",
                                            "transition-colors"
                                        )}
                                    />
                                ) : (
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span className="text-xs text-zinc-500 font-mono shrink-0 w-5 text-right">{index + 1}.</span>
                                        <span
                                            onClick={() => handleStartEdit(index, interest)}
                                            className="flex-1 text-white text-sm sm:text-base cursor-pointer hover:text-zinc-200 transition-colors py-1 truncate select-none"
                                            title="Click to edit"
                                        >
                                            {interest}
                                        </span>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={() => handleDelete(index)}
                                    className="ml-2 p-1 text-zinc-600 hover:text-red-400 transition-colors rounded shrink-0"
                                    aria-label={`Delete ${interest}`}
                                    title="Delete"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export default LovesEditor;
