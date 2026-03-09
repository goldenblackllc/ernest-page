'use client';

import { useState } from 'react';
import { X, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CharacterReviewProps {
    review: {
        id: string;
        month: string;
        content: string;
        read?: boolean;
        created_at: any;
    };
    characterTitle: string;
    avatarUrl?: string;
    isOpen: boolean;
    onClose: () => void;
}

function formatMonth(monthStr: string): string {
    try {
        const [year, month] = monthStr.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch {
        return monthStr;
    }
}

export function CharacterReview({ review, characterTitle, avatarUrl, isOpen, onClose }: CharacterReviewProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={onClose} />

            {/* Full-screen letter */}
            <div className="relative w-full h-full max-w-2xl mx-auto flex flex-col overflow-hidden">
                {/* Header */}
                <div className="shrink-0 flex items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        {avatarUrl ? (
                            <img
                                src={avatarUrl}
                                alt={characterTitle}
                                className="w-10 h-10 rounded-full object-cover border border-white/10"
                            />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center">
                                <Mail className="w-5 h-5 text-zinc-500" />
                            </div>
                        )}
                        <div>
                            <div className="text-xs font-bold tracking-widest uppercase text-zinc-400">
                                A Letter from {characterTitle}
                            </div>
                            <div className="text-[10px] text-zinc-600 tracking-wider uppercase">
                                {formatMonth(review.month)}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-500 hover:text-white transition-colors rounded-full hover:bg-zinc-900 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Letter body */}
                <div className="flex-1 overflow-y-auto px-8 sm:px-12 py-8">
                    <div className="text-base sm:text-lg leading-relaxed text-zinc-300 whitespace-pre-line font-serif">
                        {review.content}
                    </div>
                </div>

                {/* Footer */}
                <div className="shrink-0 px-8 py-6 border-t border-white/5">
                    <button
                        onClick={onClose}
                        className="w-full py-3 text-xs font-bold tracking-widest uppercase text-zinc-500 hover:text-white transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
