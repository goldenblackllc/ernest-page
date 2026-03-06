'use client';

import { useState } from 'react';
import { CharacterIdentity } from '@/types/character';
import { FileText, Calendar, Hash, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DossierViewProps {
    identity: CharacterIdentity;
    isOpen: boolean;
    onClose: () => void;
}

function toTitleCase(str: string): string {
    const minorWords = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'of', 'in', 'up', 'as']);
    return str
        .toLowerCase()
        .split(/\s+/)
        .map((word, i) => {
            if (i === 0 || !minorWords.has(word)) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            }
            return word;
        })
        .join(' ');
}

export function DossierView({ identity, isOpen, onClose }: DossierViewProps) {
    const [openSections, setOpenSections] = useState<Set<number>>(new Set([0]));

    if (!isOpen) return null;

    const sections = parseDossier(identity.dossier);

    const toggleSection = (index: number) => {
        setOpenSections(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-lg max-h-[85vh] bg-zinc-950 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="shrink-0 border-b border-white/5 px-6 py-4 bg-zinc-900/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-zinc-500" />
                            <h2 className="text-sm font-bold text-zinc-200">Dossier</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-zinc-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest min-h-[44px] flex items-center"
                        >
                            Close
                        </button>
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                            <Hash className="w-3 h-3" />
                            <span>{identity.session_count || 0} sessions</span>
                        </div>
                        {identity.dossier_updated_at && (
                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                                <Calendar className="w-3 h-3" />
                                <span>Last updated {formatDate(identity.dossier_updated_at)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {identity.dossier ? (
                        <div className="space-y-3">
                            {sections.map((section, i) => {
                                const isSectionOpen = openSections.has(i);
                                return (
                                    <div key={i} className="border border-white/10 rounded-xl overflow-hidden">
                                        {section.heading ? (
                                            <>
                                                <button
                                                    onClick={() => toggleSection(i)}
                                                    className="w-full flex items-center justify-between px-4 min-h-[44px] py-3 text-left hover:bg-white/[0.03] transition-colors duration-200"
                                                >
                                                    <h3 className="text-base font-semibold text-zinc-100 tracking-wide">
                                                        {toTitleCase(section.heading)}
                                                    </h3>
                                                    <ChevronDown
                                                        className={cn(
                                                            "w-4 h-4 text-zinc-500 shrink-0 ml-2 transition-transform duration-200 ease-out",
                                                            isSectionOpen && "rotate-180"
                                                        )}
                                                    />
                                                </button>
                                                <div
                                                    className={cn(
                                                        "grid transition-all duration-200 ease-out",
                                                        isSectionOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                                                    )}
                                                >
                                                    <div className="overflow-hidden">
                                                        <div className="px-4 pb-4 pt-1 border-t border-white/5">
                                                            <div className="text-sm text-zinc-400 leading-relaxed whitespace-pre-line">
                                                                {section.content}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="px-4 py-3">
                                                <div className="text-sm text-zinc-400 leading-relaxed whitespace-pre-line">
                                                    {section.content}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <FileText className="w-8 h-8 text-zinc-800 mx-auto mb-3" />
                            <p className="text-sm text-zinc-600">
                                Your dossier will build over time as you use the app.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function parseDossier(dossier: string): Array<{ heading?: string; content: string }> {
    if (!dossier) return [];

    // Split by ═══ section headers
    const parts = dossier.split(/═══\s*/);
    const sections: Array<{ heading?: string; content: string }> = [];

    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Check if this part starts with a heading (ends with ═══)
        const headingMatch = trimmed.match(/^(.+?)═══\n?([\s\S]*)/);
        if (headingMatch) {
            sections.push({
                heading: headingMatch[1].trim(),
                content: headingMatch[2].trim(),
            });
        } else {
            // Could be the title/header section or content without ═══ ending
            sections.push({ content: trimmed });
        }
    }

    return sections;
}

function formatDate(timestamp: any): string {
    if (!timestamp) return '';
    try {
        // Handle Firestore Timestamp
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return '';
    }
}
