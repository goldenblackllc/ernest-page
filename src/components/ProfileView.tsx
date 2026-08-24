"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterBible, CharacterProfile, CharacterIdentity } from "@/types/character";
import { db } from "@/lib/firebase/config";
import { cn } from "@/lib/utils";
import { User, ChevronDown, Pencil, FileText, Loader2, Shield, Volume2, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { DossierView } from "./DossierView";
import { VoiceBrowser } from "./VoiceBrowser";

import { parseMarkdownToSections } from "@/lib/utils/parseContent";
import { IdentityForm, IdentityFormData } from "./IdentityForm";

import { useTranslations } from "next-intl";

export function ProfileView() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const [bible, setBible] = useState<CharacterBible | null>(null);
    const [identity, setIdentity] = useState<CharacterIdentity | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isAvatarEditOpen, setIsAvatarEditOpen] = useState(false);
    const [isDossierOpen, setIsDossierOpen] = useState(false);
    const [expandedSection, setExpandedSection] = useState<number | null>(null);
    const [expandedNestedSection, setExpandedNestedSection] = useState<number | null>(null);


    const t = useTranslations('profile');

    useEffect(() => {
        if (!user) return;
        setLoading(true);

        const unsubscribe = subscribeToCharacterProfile(user.uid, (data) => {
            setProfile(data);
            setBible(data.character_bible);
            setIdentity(data.identity || null);
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
    if (!bible && !identity) return null;

    const displayTitle = identity?.title || bible?.source_code?.archetype || t('unknownCharacter');
    const displaySections = bible?.compiled_output?.ideal;

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
                            {bible?.compiled_output?.avatar_url ? (
                                <img src={bible.compiled_output.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
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
                        </div>
                    </div>
                </div>

                {/* ── MY VOICE ── */}
                <VoiceBrowser
                    currentVoiceId={bible?.voice_id}
                    currentVoiceName={bible?.voice_name}
                />

                {/* IDENTITY VISION (shown when no compiled bible yet) */}
                {identity?.dream_self && (!displaySections || displaySections.length === 0) && (
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-bold mb-3">{t('identityTitle')}</p>
                        <p className="text-sm text-zinc-300 leading-relaxed">{identity.dream_self}</p>
                    </div>
                )}

                {/* ACCORDION VAULT (compiled bible sections) */}
                {displaySections && displaySections.length > 0 && (
                    <div className="space-y-3">
                        {displaySections.map((section: any, i: number) => {
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
                                                                    <ReactMarkdown>{subSection.body}</ReactMarkdown>
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

            {/* Edit Modal — Form-based editor with pre-populated values */}
            <EditIdentityModal
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                currentRant={identity?.dream_rant || ""}
                currentGender={identity?.gender || ""}
                currentAge={identity?.age || ""}
                currentHeritage={identity?.heritage || identity?.ethnicity || ""}
                currentSkinTone={identity?.skin_tone || ""}
                currentHairColors={identity?.hair_colors || (identity?.hair_color ? [identity.hair_color] : [])}
                currentHairTexture={identity?.hair_texture || ""}
                currentHairVolume={identity?.hair_volume || ""}
                currentEyeColor={identity?.eye_color || ""}
                currentHeight={identity?.height || ""}
                currentPeople={identity?.important_people || ""}
                currentEnjoyments={identity?.things_i_enjoy || ""}
                currentCharacterName={bible?.character_name || identity?.character_name || ""}
            />

            {/* Avatar Properties Modal — physical traits only */}
            <EditAvatarModal
                isOpen={isAvatarEditOpen}
                onClose={() => setIsAvatarEditOpen(false)}
                currentGender={identity?.gender || ""}
                currentAge={identity?.age || ""}
                currentHeritage={identity?.heritage || identity?.ethnicity || ""}
                currentSkinTone={identity?.skin_tone || ""}
                currentHairColors={identity?.hair_colors || (identity?.hair_color ? [identity.hair_color] : [])}
                currentHairTexture={identity?.hair_texture || ""}
                currentHairVolume={identity?.hair_volume || ""}
                currentEyeColor={identity?.eye_color || ""}
                currentHeight={identity?.height || ""}
                avatarUrl={bible?.compiled_output?.avatar_url}
            />

        </>
    );
}

// ——— Edit Identity Modal (Form-based → Background Character Rebuild) ———

function EditIdentityModal({ isOpen, onClose, currentRant, currentGender, currentAge, currentHeritage, currentSkinTone, currentHairColors, currentHairTexture, currentHairVolume, currentEyeColor, currentHeight, currentPeople, currentEnjoyments, currentCharacterName }: { isOpen: boolean; onClose: () => void; currentRant: string; currentGender: string; currentAge: string; currentHeritage: string; currentSkinTone: string; currentHairColors: string[]; currentHairTexture: string; currentHairVolume: string; currentEyeColor: string; currentHeight: string; currentPeople: string; currentEnjoyments: string; currentCharacterName: string }) {
    const { user } = useAuth();
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const t = useTranslations('profile');

    // Reset when modal opens
    const wasOpen = React.useRef(false);
    React.useEffect(() => {
        if (isOpen && !wasOpen.current) {
            setIsProcessing(false);
            setError(null);
        }
        wasOpen.current = isOpen;
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (data: IdentityFormData) => {
        if (!user) return;
        setIsProcessing(true);
        setError(null);

        try {
            // Save identity fields directly to Firestore (fast, <1s)
            const { doc, setDoc } = await import('firebase/firestore');
            await setDoc(doc(db, 'users', user.uid), {
                identity: {
                    dream_rant: data.rant.trim(),
                    gender: data.gender.trim(),
                    age: data.age.trim(),
                    heritage: data.heritage.trim(),
                    skin_tone: data.skin_tone.trim(),
                    hair_colors: data.hair_colors,
                    hair_texture: data.hair_texture.trim(),
                    hair_volume: data.hair_volume.trim(),
                    eye_color: data.eye_color.trim(),
                    height: data.height.trim(),
                    important_people: data.people.trim(),
                    things_i_enjoy: data.enjoyments.trim(),
                    character_name: data.character_name.trim(),
                },
                character_bible: {
                    status: 'compiling',
                    last_updated: Date.now(),
                    // Preserve character_name in bible too
                    ...(data.character_name.trim() ? { character_name: data.character_name.trim() } : {}),
                },
            }, { merge: true });

            // Navigate to feed immediately — user sees the "compiling" status card
            onClose();
            window.location.href = '/';

            // Fire the full process API in the background (fire-and-forget)
            // This handles AI enrichment (title, dream_self) + bible compilation + avatar
            user.getIdToken().then(idToken => {
                fetch('/api/onboarding/process', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({
                        rant: data.rant.trim(),
                        gender: data.gender.trim(),
                        age: data.age.trim(),
                        heritage: data.heritage.trim(),
                        skin_tone: data.skin_tone.trim(),
                        hair_colors: data.hair_colors,
                        hair_texture: data.hair_texture.trim(),
                        hair_volume: data.hair_volume.trim(),
                        eye_color: data.eye_color.trim(),
                        height: data.height.trim(),
                        important_people: data.people.trim(),
                        things_i_enjoy: data.enjoyments.trim(),
                        character_name: data.character_name.trim(),
                    }),
                }).catch(err => console.error('[Edit] Background process error:', err));
            }).catch(err => console.error('[Edit] Token error:', err));
        } catch (err: any) {
            setError(err.message || 'Something went wrong.');
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-zinc-950 flex flex-col">
            {/* Header */}
            <div className="shrink-0 border-b border-white/5 px-6 py-4 bg-zinc-900/50 flex items-center justify-between pt-[calc(16px+env(safe-area-inset-top))]">
                <h2 className="text-sm font-bold text-white">{t('editIdentityModalTitle')}</h2>
                <button onClick={isProcessing ? undefined : onClose} className="text-zinc-500 hover:text-white transition-colors text-sm font-semibold py-2 px-3">
                    {t('close')}
                </button>
            </div>

            {/* Content — fills remaining screen height */}
            <div className="flex-1 flex flex-col min-h-0 px-6 pt-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
                {isProcessing ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-6">
                        <div className="w-12 h-12 rounded-full border-2 border-zinc-700 border-t-white animate-spin" />
                        <p className="text-base text-zinc-400">{t('rebuildingCharacter')}</p>
                    </div>
                ) : (
                    <>
                        {error && (
                            <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 shrink-0">{error}</div>
                        )}
                        <IdentityForm
                            initialValues={{
                                character_name: currentCharacterName,
                                gender: currentGender,
                                age: currentAge,
                                heritage: currentHeritage,
                                skin_tone: currentSkinTone,
                                hair_colors: currentHairColors,
                                hair_texture: currentHairTexture,
                                hair_volume: currentHairVolume,
                                eye_color: currentEyeColor,
                                height: currentHeight,
                                rant: currentRant,
                                people: currentPeople,
                                enjoyments: currentEnjoyments,
                            }}
                            onSubmit={handleSubmit}
                            isSubmitting={isProcessing}
                            submitLabel={t('rebuildCharacterBtn')}
                            showHeadings={false}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

// ——— Edit Avatar Modal (Physical traits only → Avatar Regeneration) ———

const SKIN_TONES = ['Fair', 'Light', 'Medium', 'Olive', 'Tan', 'Brown', 'Dark Brown', 'Deep'];
const HAIR_COLORS = ['Black', 'Dark Brown', 'Brown', 'Light Brown', 'Auburn', 'Red', 'Blonde', 'Gray', 'White'];
const HAIR_TEXTURES = ['Straight', 'Wavy', 'Curly', 'Coily'];
const HAIR_VOLUMES = ['Thick', 'Full', 'Thinning', 'Receding', 'Bald/Shaved'];
const EYE_COLORS = ['Brown', 'Hazel', 'Green', 'Blue', 'Gray', 'Amber'];

function AvatarPillSelect({ label, options, value, onChange }: {
    label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
    return (
        <div>
            <label className="text-sm text-zinc-400 font-semibold mb-2 block">{label}</label>
            <div className="flex flex-wrap gap-2">
                {options.map(opt => (
                    <button key={opt} type="button"
                        onClick={() => onChange(value === opt ? '' : opt)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all
                            ${value === opt ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                        {opt}
                    </button>
                ))}
            </div>
        </div>
    );
}

function AvatarPillMultiSelect({ label, options, values, onChange }: {
    label: string; options: string[]; values: string[]; onChange: (v: string[]) => void;
}) {
    const toggle = (opt: string) => {
        if (values.includes(opt)) {
            onChange(values.filter(v => v !== opt));
        } else {
            onChange([...values, opt]);
        }
    };
    return (
        <div>
            <label className="text-sm text-zinc-400 font-semibold mb-2 block">{label}</label>
            <div className="flex flex-wrap gap-2">
                {options.map(opt => (
                    <button key={opt} type="button"
                        onClick={() => toggle(opt)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all
                            ${values.includes(opt) ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                        {opt}
                    </button>
                ))}
            </div>
        </div>
    );
}

function EditAvatarModal({ isOpen, onClose, currentGender, currentAge, currentHeritage, currentSkinTone, currentHairColors, currentHairTexture, currentHairVolume, currentEyeColor, currentHeight, avatarUrl }: {
    isOpen: boolean;
    onClose: () => void;
    currentGender: string;
    currentAge: string;
    currentHeritage: string;
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
    const [gender, setGender] = useState(currentGender);
    const [age, setAge] = useState(currentAge);
    const [heritage, setHeritage] = useState(currentHeritage);
    const [skinTone, setSkinTone] = useState(currentSkinTone);
    const [hairColors, setHairColors] = useState<string[]>(currentHairColors);
    const [hairTexture, setHairTexture] = useState(currentHairTexture);
    const [hairVolume, setHairVolume] = useState(currentHairVolume);
    const [eyeColor, setEyeColor] = useState(currentEyeColor);
    const [height, setHeight] = useState(currentHeight);
    const [isSaving, setIsSaving] = useState(false);
    const [waitingForAvatar, setWaitingForAvatar] = useState(false);
    const [avatarReady, setAvatarReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const savedAvatarUrl = React.useRef<string | undefined>(undefined);

    // Sync state when modal opens with fresh props
    const wasOpen = React.useRef(false);
    React.useEffect(() => {
        if (isOpen && !wasOpen.current) {
            setGender(currentGender);
            setAge(currentAge);
            setHeritage(currentHeritage);
            setSkinTone(currentSkinTone);
            setHairColors(currentHairColors);
            setHairTexture(currentHairTexture);
            setHairVolume(currentHairVolume);
            setEyeColor(currentEyeColor);
            setHeight(currentHeight);
            setIsSaving(false);
            setWaitingForAvatar(false);
            setAvatarReady(false);
            setError(null);
            savedAvatarUrl.current = undefined;
        }
        wasOpen.current = isOpen;
    }, [isOpen, currentGender, currentAge, currentHeritage, currentSkinTone, currentHairColors, currentHairTexture, currentHairVolume, currentEyeColor, currentHeight]);

    // Detect when new avatar arrives from Firestore subscription
    React.useEffect(() => {
        if (waitingForAvatar && savedAvatarUrl.current !== undefined && avatarUrl && avatarUrl !== savedAvatarUrl.current) {
            setWaitingForAvatar(false);
            setAvatarReady(true);
        }
    }, [avatarUrl, waitingForAvatar]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!user || isSaving) return;
        setIsSaving(true);
        setError(null);

        try {
            const { doc, setDoc } = await import('firebase/firestore');
            await setDoc(doc(db, 'users', user.uid), {
                identity: {
                    gender: gender.trim(),
                    age: age.trim(),
                    heritage: heritage.trim(),
                    skin_tone: skinTone,
                    hair_colors: hairColors,
                    hair_texture: hairTexture,
                    hair_volume: hairVolume,
                    eye_color: eyeColor,
                    height: height.trim(),
                },
                character_bible: {
                    avatar_status: 'pending',
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
                <h2 className="text-sm font-bold text-white">Edit Appearance</h2>
                {isEditing && (
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-sm font-semibold py-2 px-3">
                        {t('profile.close')}
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 pt-6 pb-[calc(24px+env(safe-area-inset-bottom))]">
                {/* Avatar preview — always visible */}
                <div className="flex justify-center mb-6">
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
                    <p className="text-center text-sm text-zinc-500 mb-4">Regenerating your avatar...</p>
                )}

                {/* Done state */}
                {avatarReady && (
                    <div className="flex flex-col items-center gap-4 mb-4">
                        <p className="text-sm text-zinc-300">Avatar updated</p>
                        <button
                            onClick={onClose}
                            className="w-full bg-white text-black py-3.5 text-base font-bold rounded-xl hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150"
                        >
                            Done
                        </button>
                    </div>
                )}

                {/* Edit form — only visible when editing */}
                {isEditing && (
                    <>
                        <div className="space-y-5">
                            <div>
                                <label className="text-sm text-zinc-400 font-semibold mb-2 block">Gender</label>
                                <input
                                    type="text"
                                    value={gender}
                                    onChange={(e) => setGender(e.target.value)}
                                    placeholder="Man, Woman, etc."
                                    maxLength={50}
                                    className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                                />
                            </div>

                            <div>
                                <label className="text-sm text-zinc-400 font-semibold mb-2 block">Date of Birth</label>
                                <input
                                    type="date"
                                    value={age}
                                    onChange={(e) => setAge(e.target.value)}
                                    max={new Date().toISOString().split('T')[0]}
                                    min="1920-01-01"
                                    className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30 [color-scheme:dark]"
                                />
                            </div>

                            <div>
                                <label className="text-sm text-zinc-400 font-semibold mb-1 block">
                                    {t('onboarding.identityForm.heritageLabel')} <span className="text-zinc-400">{t('onboarding.identityForm.heritageOptional')}</span>
                                </label>
                                <p className="text-sm text-zinc-500 mb-2">{t('onboarding.identityForm.heritageSub')}</p>
                                <input
                                    type="text"
                                    value={heritage}
                                    onChange={(e) => setHeritage(e.target.value)}
                                    placeholder={t('onboarding.identityForm.heritagePlaceholder')}
                                    maxLength={100}
                                    className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                                />
                            </div>

                            <AvatarPillSelect label={t('onboarding.identityForm.skinToneLabel')} options={SKIN_TONES} value={skinTone} onChange={setSkinTone} />
                            <AvatarPillSelect label="Eye Color" options={EYE_COLORS} value={eyeColor} onChange={setEyeColor} />
                            <AvatarPillMultiSelect label={t('onboarding.identityForm.hairColorLabel')} options={HAIR_COLORS} values={hairColors} onChange={setHairColors} />
                            <AvatarPillSelect label={t('onboarding.identityForm.hairTextureLabel')} options={HAIR_TEXTURES} value={hairTexture} onChange={setHairTexture} />
                            <AvatarPillSelect label="Hair Volume" options={HAIR_VOLUMES} value={hairVolume} onChange={setHairVolume} />

                            <div>
                                <label className="text-sm text-zinc-400 font-semibold mb-2 block">Height</label>
                                <input
                                    type="text"
                                    value={height}
                                    onChange={(e) => setHeight(e.target.value)}
                                    placeholder="e.g., 5'10&quot; or 178cm"
                                    maxLength={20}
                                    className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-xl mt-4">{error}</div>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="w-full bg-white text-black py-3.5 text-base font-bold rounded-xl hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed mt-6"
                        >
                            {isSaving ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                    Saving...
                                </span>
                            ) : 'Update Avatar'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

// ——— Voice Browser Component ———
// Imported from shared component: @/components/VoiceBrowser
