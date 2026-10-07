"use client";

import React, { useState, useRef, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface EditableListProps<T> {
    items: T[];
    getKey: (item: T) => string;
    getText: (item: T) => string;
    onAdd: (text: string) => void;
    /** Called with the trimmed text when an edit changes it. */
    onEdit: (item: T, text: string) => void;
    /** Called on delete, and when an edit empties the item. */
    onDelete: (item: T) => void;
    title: string;
    icon?: React.ReactNode;
    addPlaceholder: string;
    addAriaLabel?: string;
    emptyText: string;
    editTitle: string;
    deleteAriaLabel: (text: string) => string;
    deleteTitle: string;
    /** Rendered before each item's text (e.g. a number or a checkbox). */
    renderLeading?: (item: T, index: number) => React.ReactNode;
    itemTextClassName?: (item: T) => string;
    className?: string;
}

const focusRing = "focus:outline-none focus:border-amber-400/80 focus:ring-1 focus:ring-amber-400/50";

/** Add / list / inline-edit / delete list shared by the My Life editors. */
export function EditableList<T>({
    items,
    getKey,
    getText,
    onAdd,
    onEdit,
    onDelete,
    title,
    icon,
    addPlaceholder,
    addAriaLabel,
    emptyText,
    editTitle,
    deleteAriaLabel,
    deleteTitle,
    renderLeading,
    itemTextClassName,
    className,
}: EditableListProps<T>) {
    const [newText, setNewText] = useState('');
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState('');

    const editInputRef = useRef<HTMLInputElement>(null);
    // Enter/Escape unmount the input, which can fire a trailing blur; these guard against a second save
    const isCancelingRef = useRef(false);
    const isSubmittingRef = useRef(false);

    // Auto-focus and select text when entering inline edit mode
    useEffect(() => {
        if (editingKey !== null && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [editingKey]);

    const stopEditing = () => {
        setEditingKey(null);
        setEditingValue('');
    };

    const handleStartEdit = (item: T) => {
        setEditingKey(getKey(item));
        setEditingValue(getText(item));
    };

    const handleSaveEdit = () => {
        if (editingKey === null || isCancelingRef.current || isSubmittingRef.current) return;
        isSubmittingRef.current = true;

        const item = items.find((i) => getKey(i) === editingKey);
        const trimmed = editingValue.trim();
        if (item !== undefined) {
            if (!trimmed) {
                onDelete(item);
            } else if (trimmed !== getText(item)) {
                onEdit(item, trimmed);
            }
        }
        stopEditing();

        setTimeout(() => {
            isSubmittingRef.current = false;
        }, 0);
    };

    const handleCancelEdit = () => {
        isCancelingRef.current = true;
        stopEditing();

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

    const handleDelete = (item: T) => {
        if (editingKey === getKey(item)) stopEditing();
        onDelete(item);
    };

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newText.trim();
        if (!trimmed) return;
        onAdd(trimmed);
        setNewText('');
    };

    return (
        <div className={cn("flex flex-col h-full w-full min-h-0", className)}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-4 shrink-0">
                {icon}
                <h2 className="text-xl font-bold text-white">{title}</h2>
            </div>

            {/* Add input */}
            <form onSubmit={handleAdd} className="relative flex items-center mb-3 shrink-0">
                <button
                    type="submit"
                    disabled={!newText.trim()}
                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-500 hover:text-white disabled:hover:text-zinc-500 transition-colors"
                    aria-label={addAriaLabel ?? addPlaceholder}
                    tabIndex={-1}
                >
                    <Plus className="w-4 h-4" />
                </button>
                <input
                    type="text"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder={addPlaceholder}
                    className={cn(
                        "w-full bg-zinc-800/50 rounded-lg border border-zinc-700/50",
                        "text-white placeholder-zinc-500 text-sm",
                        "pl-9 pr-4 py-2.5",
                        focusRing,
                        "transition-colors"
                    )}
                />
            </form>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                {items.length === 0 ? (
                    <div className="py-8 text-center text-sm text-zinc-500">
                        {emptyText}
                    </div>
                ) : (
                    items.map((item, index) => {
                        const key = getKey(item);
                        const text = getText(item);

                        return (
                            <div
                                key={key}
                                className="flex items-center justify-between gap-2 py-2.5 px-1 border-b border-zinc-800/50 group"
                            >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {renderLeading?.(item, index)}
                                    {editingKey === key ? (
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
                                                focusRing,
                                                "transition-colors"
                                            )}
                                        />
                                    ) : (
                                        <span
                                            onClick={() => handleStartEdit(item)}
                                            className={cn(
                                                "flex-1 text-sm sm:text-base break-words cursor-pointer select-none py-1 transition-colors",
                                                itemTextClassName ? itemTextClassName(item) : "text-white hover:text-zinc-200"
                                            )}
                                            title={editTitle}
                                        >
                                            {text}
                                        </span>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleDelete(item)}
                                    className="shrink-0 p-1 text-zinc-600 hover:text-red-400 transition-colors rounded focus:outline-none"
                                    aria-label={deleteAriaLabel(text)}
                                    title={deleteTitle}
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
