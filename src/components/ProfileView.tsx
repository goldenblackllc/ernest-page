"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterProfile, Bible } from "@/types/character";
import { db } from "@/lib/firebase/config";
import { cn } from "@/lib/utils";
import { User, ChevronDown, Pencil, FileText, Loader2, Shield, Volume2, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { VoiceBrowser } from "./VoiceBrowser";

import { parseMarkdownToSections } from "@/lib/utils/parseContent";
import { IdentityForm, IdentityFormData } from "./IdentityForm";

import { useTranslations } from "next-intl";

export function ProfileView() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const [bible, setBible] = useState<Bible | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAvatarEditOpen, setIsAvatarEditOpen] = useState(false);

    const [expandedSection, setExpandedSection] = useState<number | null>(null);
    const [expandedNestedSection, setExpandedNestedSection] = useState<number | null>(null);

    // Dev-only: show bible inputs panel on localhost
    const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');


    const t = useTranslations('profile');

    useEffect(() => {
        if (!user) return;
        setLoading(true);

        const unsubscribe = subscribeToCharacterProfile(user.uid, (data) => {
            setProfile(data);
            setBible(data.bible || null);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    // Open avatar edit modal when dispatched from feed cards or other components
    useEffect(() => {
        const handleOpenEditor = () => setIsAvatarEditOpen(true);
        window.addEventListener('open-identity-editor', handleOpenEditor);
        // Also check URL param (from feed card navigation to /profile)
        if (typeof window !== 'undefined' && window.location.search.includes('edit=identity')) {
            setIsAvatarEditOpen(true);
            // Clean up URL param
            window.history.replaceState({}, '', '/profile');
        }
        return () => window.removeEventListener('open-identity-editor', handleOpenEditor);
    }, []);

    if (loading) return <div className="h-48 w-full animate-pulse bg-zinc-900/50 rounded-xl mb-6" />;
    if (!profile) return null;

    const displayTitle = profile?.defining_words?.join(', ') || t('unknownCharacter');
    const displaySections = bible?.sections;

    return (
        <>
            <div className="w-full mb-8 space-y-6">
                {/* ── PROFILE HEADER ── */}
                <div className="px-4">
                    {/* ── ROW 1: IDENTITY ── */}
                    <div className="flex flex-row items-center gap-4 pb-4 border-b border-white/5">
                        <div 
                            className="w-14 h-14 rounded-full bg-zinc-800 ring-1 ring-zinc-800 overflow-hidden shrink-0 cursor-pointer hover:ring-zinc-700 transition-colors"
                            onClick={() => setIsAvatarEditOpen(true)}
                        >
                            {profile?.avatar?.url ? (
                                <img src={profile?.avatar?.url} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-500">
                                    <User className="w-6 h-6" />
                                </div>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-2xl font-bold text-white leading-tight capitalize">
                                {displayTitle}
                            </h2>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold mt-1">
                                {t('profileTab')}
                            </p>
                            {bible?.last_updated && (
                                <p className="text-[10px] text-zinc-400 mt-0.5">
                                    {t('lastUpdated', { date: new Date(bible.last_updated).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) })}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── MY VOICE ── */}
                <VoiceBrowser
                    currentVoiceId={profile?.voice?.id}
                    currentVoiceName={profile?.voice?.name}
                />

                        
                {/* ── COMPILED CHARACTER BIBLE (Accordion Vault) ── */}
                {displaySections && displaySections.length > 0 && (
                    <div className="space-y-2 px-4">
                        {displaySections.map((section, i) => {
                            const isOpen = expandedSection === i;
                            return (
                                <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden transition-all duration-200">
                                    <button
                                        onClick={() => {
                                            setExpandedSection(isOpen ? null : i);
                                            setExpandedNestedSection(null);
                                        }}
                                        className="w-full flex items-center justify-between p-4 text-left focus:outline-none hover:bg-zinc-900/80 transition-colors"
                                    >
                                        <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">{section.heading}</h3>
                                        <ChevronDown className={cn("w-5 h-5 text-zinc-500 transition-transform duration-200", isOpen && "rotate-180 text-emerald-500")} />
                                    </button>
                                    {isOpen && (
                                        <div className="p-4 border-t border-zinc-800/50 bg-zinc-950/50 space-y-2">
                                            {parseMarkdownToSections(section.content).map((subSection, j) => {
                                                const isNestedOpen = expandedNestedSection === j;
                                                return (
                                                    <div key={j} className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg overflow-hidden transition-all duration-200">
                                                        <button
                                                            onClick={() => setExpandedNestedSection(isNestedOpen ? null : j)}
                                                            className="w-full flex items-center justify-between p-3 text-left focus:outline-none hover:bg-zinc-800/50 transition-colors"
                                                        >
                                                            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{subSection.subHeading}</h4>
                                                            <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform duration-200", isNestedOpen && "rotate-180 text-emerald-500")} />
                                                        </button>
                                                        {isNestedOpen && (
                                                            <div className="p-4 border-t border-zinc-700/50 bg-black/20">
                                                                <div className="text-sm text-zinc-300 leading-relaxed prose prose-invert prose-sm max-w-none prose-a:text-emerald-400 prose-strong:text-emerald-300">
                                                                    <ReactMarkdown>{subSection.body.replace(/\n/g, '  \n')}</ReactMarkdown>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}


            </div>

            {/* Avatar Properties Modal — physical traits only */}
            <EditAvatarModal
                isOpen={isAvatarEditOpen}
                onClose={() => setIsAvatarEditOpen(false)}
                currentCharacterName={profile?.name || profile?.name || ""}
                currentGender={profile?.gender || ""}
                currentBirthdate={profile?.birthdate || ""}
                currentEthnicity={profile?.ethnicity || ""}
                currentSkinTone={profile?.skin_tone || ""}
                currentHairColors={profile?.hair_colors || []}
                currentHairTexture={profile?.hair_texture || ""}
                currentHairVolume={profile?.hair_volume || ""}
                currentEyeColor={profile?.eye_color || ""}
                currentHeight={profile?.height || ""}
                avatarUrl={profile?.avatar?.url}
            />

        </>
    );
}

// ——— Edit Avatar Modal (Physical traits only → Avatar Regeneration) ———

function EditAvatarModal({ isOpen, onClose, currentCharacterName, currentGender, currentBirthdate, currentEthnicity, currentSkinTone, currentHairColors, currentHairTexture, currentHairVolume, currentEyeColor, currentHeight, avatarUrl }: {
    isOpen: boolean;
    onClose: () => void;
    currentCharacterName: string;
    currentGender: string;
    currentBirthdate: string;
    currentEthnicity: string;
    currentSkinTone: string;
    currentHairColors: string[];
    currentHairTexture: string;
    currentHairVolume: string;
    currentEyeColor: string;
    currentHeight: string;
    avatarUrl?: string;
}) {
    const { user } = useAuth();
    const t = useTranslations();
    const [isSaving, setIsSaving] = useState(false);
    const [waitingForAvatar, setWaitingForAvatar] = useState(false);
    const [avatarReady, setAvatarReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const savedAvatarUrl = React.useRef<string | undefined>(undefined);

    // Track open state for resets
    const wasOpen = React.useRef(false);
    // Increment key to force IdentityForm remount when modal reopens
    const [formKey, setFormKey] = useState(0);
    React.useEffect(() => {
        if (isOpen && !wasOpen.current) {
            setIsSaving(false);
            setWaitingForAvatar(false);
            setAvatarReady(false);
            setError(null);
            savedAvatarUrl.current = undefined;
            setFormKey(k => k + 1);
        }
        wasOpen.current = isOpen;
    }, [isOpen]);

    // Detect when new avatar arrives from Firestore subscription
    React.useEffect(() => {
        if (waitingForAvatar && savedAvatarUrl.current !== undefined && avatarUrl && avatarUrl !== savedAvatarUrl.current) {
            setWaitingForAvatar(false);
            setAvatarReady(true);
        }
    }, [avatarUrl, waitingForAvatar]);

    if (!isOpen) return null;

    const handleSave = async (data: IdentityFormData) => {
        if (!user || isSaving) return;
        setIsSaving(true);
        setError(null);

        try {
            const { doc, setDoc } = await import('firebase/firestore');
            await setDoc(doc(db, 'users', user.uid), {
                    gender: data.gender.trim(),
                    birthdate: data.birthdate.trim(),
                    ethnicity: data.ethnicity.trim(),
                    skin_tone: data.skin_tone.trim(),
                    hair_colors: data.hair_colors,
                    hair_texture: data.hair_texture.trim(),
                    hair_volume: data.hair_volume.trim(),
                    eye_color: data.eye_color.trim(),
                    height: data.height.trim(),
                avatar: {
                    status: 'pending',
                },
            }, { merge: true });

            // Fire avatar regeneration in the background (no bible recompile needed)
            const idToken = await user.getIdToken();
            fetch('/api/character/avatar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({ uid: user.uid }),
            }).catch(err => console.error('[Avatar] Regeneration error:', err));

            // Transition to waiting state
            savedAvatarUrl.current = avatarUrl;
            setIsSaving(false);
            setWaitingForAvatar(true);
        } catch (err: any) {
            setError(err.message || 'Something went wrong.');
            setIsSaving(false);
        }
    };

    const isEditing = !waitingForAvatar && !avatarReady;
    const displayUrl = avatarReady ? avatarUrl : (savedAvatarUrl.current || avatarUrl);

    return (
        <div className="fixed inset-0 z-[60] bg-zinc-950 flex flex-col">
            <div className="shrink-0 border-b border-white/5 px-6 py-4 bg-zinc-900/50 flex items-center justify-between pt-[calc(16px+env(safe-area-inset-top))]">
                <h2 className="text-sm font-bold text-white">{t('profile.editAppearance')}</h2>
                {isEditing && (
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-sm font-semibold py-2 px-3">
                        {t('profile.close')}
                    </button>
                )}
            </div>

            <div className="flex-1 flex flex-col min-h-0 px-6 pt-6 pb-[calc(24px+env(safe-area-inset-bottom))]">
                {/* Avatar preview — always visible */}
                <div className="flex justify-center mb-6 shrink-0">
                    <div className="relative w-24 h-24">
                        <div className="w-24 h-24 rounded-full overflow-hidden ring-2 ring-zinc-700">
                            {displayUrl ? (
                                <img src={displayUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                                    <User className="w-8 h-8" />
                                </div>
                            )}
                        </div>
                        {waitingForAvatar && (
                            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                                <span className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            </div>
                        )}
                        {avatarReady && (
                            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center ring-2 ring-zinc-950">
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                        )}
                    </div>
                </div>

                {/* Waiting state */}
                {waitingForAvatar && (
                    <p className="text-center text-sm text-zinc-500 mb-4">{t('profile.regeneratingAvatar')}</p>
                )}

                {/* Done state */}
                {avatarReady && (
                    <div className="flex flex-col items-center gap-4 mb-4">
                        <p className="text-sm text-zinc-300">{t('profile.avatarUpdated')}</p>
                        <button
                            onClick={onClose}
                            className="w-full bg-white text-black py-3.5 text-base font-bold rounded-xl hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150"
                        >
                            {t('profile.done')}
                        </button>
                    </div>
                )}

                {/* Edit form — reuses IdentityForm with only steps 1 (gender) + 2 (physical traits) */}
                {isEditing && (
                    <>
                        {error && (
                            <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 shrink-0">{error}</div>
                        )}
                        <IdentityForm
                            key={formKey}
                            visibleSteps={[2]}
                            initialValues={{
                                character_name: currentCharacterName,
                                gender: currentGender,
                                birthdate: currentBirthdate,
                                ethnicity: currentEthnicity,
                                skin_tone: currentSkinTone,
                                hair_colors: currentHairColors,
                                hair_texture: currentHairTexture,
                                hair_volume: currentHairVolume,
                                eye_color: currentEyeColor,
                                height: currentHeight,
                            }}
                            onSubmit={handleSave}
                            isSubmitting={isSaving}
                            submitLabel={t('profile.updateAvatar')}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

// ——— Voice Browser Component ———
// Imported from shared component: @/components/VoiceBrowser

// ——— Dev-only: Bible Input Section ———
function DevInputSection({ title, content, multiline, children }: { title: string; content?: string; multiline?: boolean; children?: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-zinc-900 transition-colors"
            >
                <h4 className="text-xs font-bold text-zinc-400">{title}</h4>
                <ChevronDown className={cn("w-4 h-4 text-zinc-600 transition-transform duration-200", isOpen && "rotate-180 text-amber-500")} />
            </button>
            {isOpen && (
                <div className="p-3 border-t border-zinc-800/50 bg-black/20">
                    {children || (
                        <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">{content}</pre>
                    )}
                </div>
            )}
        </div>
    );
}
