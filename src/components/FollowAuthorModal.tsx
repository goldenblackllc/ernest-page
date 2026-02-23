import React, { useState } from 'react';
import { X, Loader2, Link } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { updateCharacterProfile } from '@/lib/firebase/character';
import { CharacterProfile } from '@/types/character';

interface FollowAuthorModalProps {
    isOpen: boolean;
    onClose: () => void;
    postAuthorId: string;
    profile: CharacterProfile | null;
}

export function FollowAuthorModal({ isOpen, onClose, postAuthorId, profile }: FollowAuthorModalProps) {
    const { user } = useAuth();
    const [alias, setAlias] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!alias.trim()) {
            setError('Please enter a name for this author.');
            return;
        }

        if (!user || !profile) return;

        setIsSaving(true);
        setError('');

        try {
            const updatedFollowing = {
                ...(profile.following || {}),
                [postAuthorId]: alias.trim()
            };

            await updateCharacterProfile(user.uid, {
                following: updatedFollowing
            });

            setAlias('');
            onClose();
        } catch (err: any) {
            console.error("Failed to follow author:", err);
            setError(err.message || 'Failed to save alias.');
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
                        <h2 className="text-sm font-bold tracking-tight">Add to Rolodex</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-900 rounded-full transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6">
                    <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
                        Assign a private name to this author. Only you will see this name next to their future posts in your feed.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <input
                                type="text"
                                autoFocus
                                value={alias}
                                onChange={(e) => {
                                    setAlias(e.target.value);
                                    if (error) setError('');
                                }}
                                placeholder="e.g., 'Stoic Boston Dad' or 'Sarah'"
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all font-sans"
                            />
                            {error && (
                                <p className="text-xs text-red-400 mt-2 ml-1">{error}</p>
                            )}
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-sm font-bold transition-all border border-zinc-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving || !alias.trim()}
                                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:text-emerald-200/50 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center shadow-lg shadow-emerald-900/20"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Alias"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
