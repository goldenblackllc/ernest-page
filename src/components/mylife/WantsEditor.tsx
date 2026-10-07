"use client";

import React, { useMemo } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { WantItem } from '@/types/character';
import { useTranslations } from 'next-intl';
import { EditableList } from './EditableList';

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
    const t = useTranslations("mylife.wants");
    const list = useMemo(() => (Array.isArray(wants) ? wants : []), [wants]);

    // Unchecked items show first, then checked items at bottom
    const sortedWants = useMemo(() => {
        const unchecked = list.filter((item) => !item.completed);
        const checked = list.filter((item) => item.completed);
        return [...unchecked, ...checked];
    }, [list]);

    const handleToggle = (id: string) => {
        onSave(list.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)));
    };

    const handleAdd = (text: string) => {
        const newItem: WantItem = {
            id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            text,
            completed: false,
            created_at: Date.now(),
        };
        onSave([...list, newItem]);
    };

    return (
        <EditableList
            items={sortedWants}
            getKey={(item) => item.id}
            getText={(item) => item.text}
            onAdd={handleAdd}
            onEdit={(edited, text) => onSave(list.map((item) => (item.id === edited.id ? { ...item, text } : item)))}
            onDelete={(deleted) => onSave(list.filter((item) => item.id !== deleted.id))}
            title={t("title")}
            addPlaceholder={t("addPlaceholder")}
            addAriaLabel={t("addAria")}
            emptyText={t("noWants")}
            editTitle={t("tapToEdit")}
            deleteAriaLabel={(text) => t("deleteItem", { text })}
            deleteTitle={t("deleteTitle")}
            className={className}
            renderLeading={(item) => (
                <button
                    type="button"
                    onClick={() => handleToggle(item.id)}
                    className="shrink-0 p-0.5 text-zinc-400 hover:text-white transition-colors focus:outline-none"
                    aria-label={item.completed ? t("markIncomplete", { text: item.text }) : t("markComplete", { text: item.text })}
                >
                    {item.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
                    ) : (
                        <Circle className="w-5 h-5 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0" />
                    )}
                </button>
            )}
            itemTextClassName={(item) => (item.completed ? "text-zinc-500 line-through" : "text-white hover:text-zinc-200")}
        />
    );
}
