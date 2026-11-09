"use client";

import React, { useState, useRef, useEffect } from 'react';
import { CloudSun } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from 'next-intl';
import { IDENTITY_MAX_LENGTH, type Identity } from '@functions/lib/identity';

export interface DreamEditorProps {
    identity?: Identity;
    dreamLiving: string;
    dreamFinancial: string;
    onSave: (updates: { dream_living?: string; dream_financial?: string }) => void;
    /** Saves who they are; a new title is made from it */
    onSaveIdentity: (text: string) => void;
    className?: string;
}

const fieldClass = cn(
    "w-full bg-zinc-800/50 rounded-lg border border-zinc-700/50 px-3 py-2.5",
    "text-white text-sm resize-none placeholder:text-zinc-500",
    "focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30",
    "transition-colors"
);

/**
 * DreamEditor provides an interface for editing "My Dream":
 * - Who they are: who the person decided to be, with its title (their byline) under it
 * - Dream living situation (freeform textarea)
 * - Dream financial situation (freeform textarea)
 *
 * Living and financial save after a 1-second pause. Who they are saves when the
 * person leaves the field, since each save makes a new title. Anything unsaved
 * is saved when unmounted.
 */
export function DreamEditor({
    identity,
    dreamLiving = '',
    dreamFinancial = '',
    onSave,
    onSaveIdentity,
    className,
}: DreamEditorProps) {
    const t = useTranslations('mylife.dream');
    // Initialize local state once from props on mount (not continuously synced)
    const [identityText, setIdentityText] = useState<string>(() => identity?.text || '');
    const [living, setLiving] = useState<string>(() => dreamLiving || '');
    const [financial, setFinancial] = useState<string>(() => dreamFinancial || '');

    // Synchronous refs to avoid stale closures in timeouts and cleanup
    const identityRef = useRef(identityText);
    const savedIdentityRef = useRef(identity?.text || '');
    const livingRef = useRef(living);
    const financialRef = useRef(financial);
    const onSaveRef = useRef(onSave);
    const onSaveIdentityRef = useRef(onSaveIdentity);

    // Keep refs updated inside effect (outside render phase)
    useEffect(() => {
        livingRef.current = living;
        financialRef.current = financial;
        onSaveRef.current = onSave;
        onSaveIdentityRef.current = onSaveIdentity;
    }, [living, financial, onSave, onSaveIdentity]);

    // Track pending/unsaved changes and timer ID
    const isDirtyRef = useRef(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Save pending changes immediately and reset dirty state
    const savePendingChanges = () => {
        if (!isDirtyRef.current) return;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        isDirtyRef.current = false;
        onSaveRef.current({
            dream_living: livingRef.current,
            dream_financial: financialRef.current,
        });
    };

    const saveIdentity = () => {
        const text = identityRef.current.trim();
        if (text === savedIdentityRef.current) return;
        savedIdentityRef.current = text;
        onSaveIdentityRef.current(text);
    };

    // Trigger or reset 1-second debounce timer
    const triggerSave = () => {
        isDirtyRef.current = true;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            savePendingChanges();
        }, 1000);
    };

    // Flush pending changes on unmount
    useEffect(() => {
        return () => {
            savePendingChanges();
            saveIdentity();
        };
    }, []);

    // Handlers
    const handleIdentityChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setIdentityText(e.target.value);
        identityRef.current = e.target.value;
    };

    const handleLivingChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const nextLiving = e.target.value;
        setLiving(nextLiving);
        livingRef.current = nextLiving;
        triggerSave();
    };

    const handleFinancialChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const nextFinancial = e.target.value;
        setFinancial(nextFinancial);
        financialRef.current = nextFinancial;
        triggerSave();
    };

    return (
        <div className={cn("flex flex-col flex-1 overflow-y-auto space-y-6", className)}>
            {/* Header */}
            <div className="flex items-center gap-2 shrink-0">
                <CloudSun className="w-5 h-5 text-amber-400 shrink-0" />
                <h2 className="text-xl font-bold text-white">{t("title")}</h2>
            </div>

            {/* Section 1: Who they are */}
            <div className="space-y-2">
                <label htmlFor="dream-identity" className="text-sm text-zinc-400 block">
                    {t("identityLabel")}
                </label>
                <textarea
                    id="dream-identity"
                    value={identityText}
                    onChange={handleIdentityChange}
                    onBlur={saveIdentity}
                    placeholder={t("identityPlaceholder")}
                    maxLength={IDENTITY_MAX_LENGTH}
                    rows={3}
                    className={fieldClass}
                />
                {identity?.title && (
                    <p className="text-xs text-zinc-500">{t("identityTitle", { title: identity.title })}</p>
                )}
            </div>

            {/* Section 2: Living Situation */}
            <div className="space-y-2">
                <label className="text-sm text-zinc-400 block">
                    {t("livingLabel")}
                </label>
                <textarea
                    value={living}
                    onChange={handleLivingChange}
                    placeholder={t("livingPlaceholder")}
                    rows={4}
                    className={cn(fieldClass, "min-h-[100px]")}
                />
            </div>

            {/* Section 3: Financial */}
            <div className="space-y-2">
                <label className="text-sm text-zinc-400 block">
                    {t("financialLabel")}
                </label>
                <textarea
                    value={financial}
                    onChange={handleFinancialChange}
                    placeholder={t("financialPlaceholder")}
                    rows={4}
                    className={cn(fieldClass, "min-h-[100px]")}
                />
            </div>
        </div>
    );
}
