"use client";

import React, { useMemo } from 'react';
import { Check, Circle } from 'lucide-react';
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
 * Items stay in the order they were added: a ticked want stays where it is,
 * dimmed, so it doesn't seem to vanish and everything received stays in view.
 * Allows toggling completion status, deleting items, and adding new items.
 */
export function WantsEditor({ wants = [], onSave, className }: WantsEditorProps) {
    const t = useTranslations("mylife.wants");
    const list = useMemo(() => (Array.isArray(wants) ? wants : []), [wants]);

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
        onSave([newItem, ...list]);
    };

    return (
        <EditableList
            items={list}
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
                    className="relative shrink-0 text-zinc-400 hover:text-white transition-colors focus:outline-none after:absolute after:-inset-2"
                    aria-label={item.completed ? t("markIncomplete", { text: item.text }) : t("markComplete", { text: item.text })}
                >
                    {/* The same tick as the feed's My Actions card (ChoicesCard) */}
                    {item.completed ? (
                        <span className="w-5 h-5 rounded-full bg-emerald-500 border border-emerald-500 flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 text-black" strokeWidth={3} />
                        </span>
                    ) : (
                        <Circle className="w-5 h-5 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0" />
                    )}
                </button>
            )}
            itemTextClassName={(item) => (item.completed ? "text-zinc-400" : "text-white hover:text-zinc-200")}
        />
    );
}
