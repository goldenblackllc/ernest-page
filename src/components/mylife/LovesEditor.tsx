"use client";

import React, { useMemo } from 'react';
import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EditableList } from './EditableList';

export interface LovesEditorProps {
    interests: string[];
    onSave: (interests: string[]) => void;
}

interface LoveEntry {
    key: string;
    index: number;
    text: string;
}

export function LovesEditor({ interests = [], onSave }: LovesEditorProps) {
    const t = useTranslations("mylife.loves");

    // Interests are plain strings, so key them by text plus occurrence to keep keys stable across edits elsewhere
    const entries = useMemo<LoveEntry[]>(() => {
        const seen: Record<string, number> = {};
        return interests.map((text, index) => {
            const n = seen[text] = (seen[text] ?? 0) + 1;
            return { key: `${text}#${n}`, index, text };
        });
    }, [interests]);

    return (
        <EditableList
            items={entries}
            getKey={(entry) => entry.key}
            getText={(entry) => entry.text}
            onAdd={(text) => onSave([...interests, text])}
            onEdit={(entry, text) => onSave(interests.map((v, idx) => (idx === entry.index ? text : v)))}
            onDelete={(entry) => onSave(interests.filter((_, idx) => idx !== entry.index))}
            title={t("title")}
            icon={<Heart className="w-5 h-5 text-amber-400 shrink-0" />}
            addPlaceholder={t("addPlaceholder")}
            emptyText={t("noLoves")}
            editTitle={t("clickToEdit")}
            deleteAriaLabel={(text) => t("deleteItem", { text })}
            deleteTitle={t("deleteTitle")}
            renderLeading={(_, index) => (
                <span className="text-xs text-zinc-500 font-mono shrink-0 w-5 text-right">{index + 1}.</span>
            )}
        />
    );
}
