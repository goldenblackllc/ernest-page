'use client';

import React, { useState, useRef, useEffect } from 'react';
import { CloudSun } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DreamEditorProps {
    definingWords: string[];   // max 3 strings
    dreamLiving: string;
    dreamFinancial: string;
    onSave: (updates: { defining_words?: string[]; dream_living?: string; dream_financial?: string }) => void;
    className?: string;
}

const DEFINING_WORD_PLACEHOLDERS = [
    'e.g. Gentleman',
    'e.g. Approachable',
    'e.g. Successful',
] as const;

/**
 * DreamEditor provides an interface for editing "My Dream":
 * - Three defining words
 * - Dream living situation (freeform textarea)
 * - Dream financial situation (freeform textarea)
 *
 * Uses local state with a 1-second debounce before auto-saving.
 * Flushes any pending changes when unmounted.
 */
export function DreamEditor({
    definingWords = [],
    dreamLiving = '',
    dreamFinancial = '',
    onSave,
    className,
}: DreamEditorProps) {
    // Initialize local state once from props on mount (not continuously synced)
    const [words, setWords] = useState<string[]>(() => [
        definingWords[0] || '',
        definingWords[1] || '',
        definingWords[2] || '',
    ]);
    const [living, setLiving] = useState<string>(() => dreamLiving || '');
    const [financial, setFinancial] = useState<string>(() => dreamFinancial || '');

    // Synchronous refs to avoid stale closures in timeouts and cleanup
    const wordsRef = useRef(words);
    const livingRef = useRef(living);
    const financialRef = useRef(financial);
    const onSaveRef = useRef(onSave);

    // Keep refs updated inside effect (outside render phase)
    useEffect(() => {
        wordsRef.current = words;
        livingRef.current = living;
        financialRef.current = financial;
        onSaveRef.current = onSave;
    }, [words, living, financial, onSave]);

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
            defining_words: wordsRef.current,
            dream_living: livingRef.current,
            dream_financial: financialRef.current,
        });
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
        };
    }, []);

    // Handlers
    const handleWordChange = (index: number, value: string) => {
        const nextWords = [...wordsRef.current];
        nextWords[index] = value;
        setWords(nextWords);
        wordsRef.current = nextWords;
        triggerSave();
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
                <h2 className="text-xl font-bold text-white">My Dream</h2>
            </div>

            {/* Section 1: Defining Words */}
            <div className="space-y-2">
                <label className="text-sm text-zinc-400 block">
                    Three words that define you
                </label>
                <div className="space-y-2">
                    {DEFINING_WORD_PLACEHOLDERS.map((placeholder, index) => (
                        <input
                            key={index}
                            type="text"
                            value={words[index]}
                            onChange={(e) => handleWordChange(index, e.target.value)}
                            placeholder={placeholder}
                            className={cn(
                                "w-full bg-zinc-800/50 rounded-lg border border-zinc-700/50 px-3 py-2.5",
                                "text-white text-sm placeholder:text-zinc-500",
                                "focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30",
                                "transition-colors"
                            )}
                        />
                    ))}
                </div>
            </div>

            {/* Section 2: Living Situation */}
            <div className="space-y-2">
                <label className="text-sm text-zinc-400 block">
                    Living Situation
                </label>
                <textarea
                    value={living}
                    onChange={handleLivingChange}
                    placeholder="Describe your dream living situation..."
                    rows={4}
                    className={cn(
                        "w-full bg-zinc-800/50 rounded-lg border border-zinc-700/50 px-3 py-2.5",
                        "text-white text-sm resize-none min-h-[100px] placeholder:text-zinc-500",
                        "focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30",
                        "transition-colors"
                    )}
                />
            </div>

            {/* Section 3: Financial */}
            <div className="space-y-2">
                <label className="text-sm text-zinc-400 block">
                    Financial
                </label>
                <textarea
                    value={financial}
                    onChange={handleFinancialChange}
                    placeholder="Describe your dream financial situation..."
                    rows={4}
                    className={cn(
                        "w-full bg-zinc-800/50 rounded-lg border border-zinc-700/50 px-3 py-2.5",
                        "text-white text-sm resize-none min-h-[100px] placeholder:text-zinc-500",
                        "focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/30",
                        "transition-colors"
                    )}
                />
            </div>
        </div>
    );
}

export default DreamEditor;
