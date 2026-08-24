import React, { useState } from 'react';
import { X, Loader2, Link } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { updateCharacterProfile } from '@/lib/firebase/character';
import { CharacterProfile } from '@/types/character';
import { useTranslations } from 'next-intl';

interface FollowAuthorModalProps {
    isOpen: boolean;
    onClose: () => void;
    postAuthorId: string;
    authorTitle: string;
    profile: CharacterProfile | null;
}

export function FollowAuthorModal({ isOpen, onClose, postAuthorId, authorTitle, profile }: FollowAuthorModalProps) {
    const { user } = useAuth();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const t = useTranslations('followAuthorModal');

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!user || !profile) return;

        setIsSaving(true);
        setError('');

        try {
            const updatedFollowing = {
                ...(profile.following || {}),
                [postAuthorId]: authorTitle || 'Unknown'
            };

            await updateCharacterProfile(user.uid, {
                following: updatedFollowing
            });

            onClose();
        } catch (err: any) {
            console.error("Failed to follow author:", err);
            setError(err.message || t('errorSave'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md relative z-10 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-4 border-b border-zinc-800/50 bg-black/20">
                    <div className="flex items-center gap-2 text-zinc-300">
                        <Link className="w-4 h-4 text-emerald-500" />
                        <h2 className="text-sm font-bold tracking-tight">Follow Author</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-900 rounded-full transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6">
                    <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                        Follow <strong className="text-white">{authorTitle}</strong>?
                    </p>

                    <div className="space-y-4">
                        {error && (
                            <p className="text-xs text-red-400 mt-2 ml-1">{error}</p>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-sm font-bold transition-all border border-zinc-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:text-emerald-200/50 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center shadow-lg shadow-emerald-900/20"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Follow"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
