"use client";

import React, { useState } from 'react';
import { X, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { updateCharacterProfile } from '@/lib/firebase/character';
import { CharacterProfile } from '@/types/character';
import { useTranslations } from 'next-intl';

interface RolodexModalProps {
    isOpen: boolean;
    onClose: () => void;
    profile: CharacterProfile | null;
}

export function RolodexModal({ isOpen, onClose, profile }: RolodexModalProps) {
    const { user } = useAuth();
    const [removing, setRemoving] = useState<string | null>(null);
    const t = useTranslations('rolodexModal');

    if (!isOpen) return null;

    const following = profile?.following || {};
    const entries = Object.entries(following);

    const handleRemove = async (authorId: string) => {
        if (!user || !profile) return;
        setRemoving(authorId);

        try {
            const updated = { ...(profile.following || {}) };
            delete updated[authorId];

            await updateCharacterProfile(user.uid, {
                following: updated,
            });
        } catch (err) {
            console.error('Failed to unfollow:', err);
        } finally {
            setRemoving(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] relative z-10 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-black/20 shrink-0">
                    <div className="flex items-center gap-2 text-zinc-300">
                        <Users className="w-4 h-4 text-zinc-500" />
                        <h2 className="text-sm font-bold tracking-tight">{t('title')}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-900 rounded-full transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4">
                    {entries.length === 0 ? (
                        <div className="text-center py-12">
                            <Users className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                            <p className="text-sm text-zinc-500">{t('emptyState')}</p>
                            <p className="text-xs text-zinc-600 mt-1">{t('emptyStateSub')}</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {entries.map(([authorId, alias]) => (
                                <div
                                    key={authorId}
                                    className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-zinc-900/50 transition-colors group"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                                            <span className="text-xs font-bold text-zinc-400">
                                                {(alias as string).charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <span className="text-sm font-medium text-zinc-200 truncate">
                                            {alias as string}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => handleRemove(authorId)}
                                        disabled={removing === authorId}
                                        className="p-2 text-zinc-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40 shrink-0"
                                        title={t('remove')}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {entries.length > 0 && (
                    <div className="px-4 py-3 border-t border-zinc-800/50 text-center shrink-0">
                        <p className="text-[10px] text-zinc-600 uppercase tracking-widest">
                            {t('authorsFollowed', { count: entries.length })}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
