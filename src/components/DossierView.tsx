'use client';

import { CharacterIdentity } from '@/types/character';
import { FileText, Calendar, Hash } from 'lucide-react';

interface DossierViewProps {
    identity: CharacterIdentity;
    isOpen: boolean;
    onClose: () => void;
}

export function DossierView({ identity, isOpen, onClose }: DossierViewProps) {
    if (!isOpen) return null;

    const sections = parseDossier(identity.dossier);

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
                            className="text-zinc-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest"
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
                        <div className="space-y-5">
                            {sections.map((section, i) => (
                                <div key={i}>
                                    {section.heading && (
                                        <h3 className="text-[10px] uppercase tracking-[0.2em] text-emerald-500/70 font-bold mb-2">
                                            {section.heading}
                                        </h3>
                                    )}
                                    <div className="text-sm text-zinc-400 leading-relaxed whitespace-pre-line">
                                        {section.content}
                                    </div>
                                </div>
                            ))}
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
