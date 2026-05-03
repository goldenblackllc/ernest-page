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
                    <div className="flex flex-row items-center gap-4 pb-4">
                        <div className="w-14 h-14 rounded-full bg-zinc-800 ring-1 ring-zinc-800 overflow-hidden shrink-0">
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

                    {/* ── ROW 2: ACTIONS ── */}
                    <div className="flex items-center gap-3 pb-6 border-b border-white/5">
                        {/* Dossier button hidden — data still maintained server-side */}
                        <button
                            onClick={() => setIsEditOpen(true)}
                            className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold px-4 py-2.5 rounded-full transition-all shadow-sm"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                            {t('edit')}
                        </button>
                    </div>
                </div>

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

                {/* ── MY VOICE ── */}
                <VoiceBrowser
                    currentVoiceId={bible?.voice_id}
                    currentVoiceName={bible?.voice_name}
                />

            </div>

            {/* Edit Modal — Form-based editor with pre-populated values */}
            <EditIdentityModal
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                currentRant={identity?.dream_rant || ""}
                currentGender={identity?.gender || ""}
                currentAge={identity?.age || ""}
                currentEthnicity={identity?.ethnicity || ""}
                currentPeople={identity?.important_people || ""}
                currentEnjoyments={identity?.things_i_enjoy || ""}
                currentCharacterName={bible?.character_name || identity?.character_name || ""}
            />

        </>
    );
}

// ——— Edit Identity Modal (Form-based → Background Character Rebuild) ———

function EditIdentityModal({ isOpen, onClose, currentRant, currentGender, currentAge, currentEthnicity, currentPeople, currentEnjoyments, currentCharacterName }: { isOpen: boolean; onClose: () => void; currentRant: string; currentGender: string; currentAge: string; currentEthnicity: string; currentPeople: string; currentEnjoyments: string; currentCharacterName: string }) {
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
            const idToken = await user.getIdToken();
            const res = await fetch('/api/onboarding/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    rant: data.rant.trim(),
                    gender: data.gender.trim(),
                    age: data.age.trim(),
                    ethnicity: data.ethnicity.trim(),
                    important_people: data.people.trim(),
                    things_i_enjoy: data.enjoyments.trim(),
                    character_name: data.character_name.trim(),
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || result.error || 'Processing failed.');

            // Process API kicks off bible+avatar generation in background.
            // Navigate to dashboard where the status card shows progress.
            onClose();
            window.location.href = '/';
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
                                ethnicity: currentEthnicity,
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

// ——— Voice Browser Component ———

interface VoiceResult {
    voice_id: string;
    name: string;
    accent: string;
    age: string;
    gender: string;
    category: string;
    description: string;
    preview_url: string;
}

function VoiceBrowser({ currentVoiceId, currentVoiceName }: { currentVoiceId?: string; currentVoiceName?: string }) {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [results, setResults] = useState<VoiceResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [selectingId, setSelectingId] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState(currentVoiceId || '');
    const [selectedName, setSelectedName] = useState(currentVoiceName || '');
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Filters
    const [gender, setGender] = useState('');
    const [age, setAge] = useState('');
    const [accent, setAccent] = useState('');
    const [query, setQuery] = useState('');

    const stopPlaying = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
            audioRef.current = null;
        }
        setPlayingId(null);
    }, []);

    const search = useCallback(async () => {
        if (!user) {
            console.warn('[VoiceBrowser] No user — skipping search');
            return;
        }
        setLoading(true);
        stopPlaying();

        try {
            const idToken = await user.getIdToken();
            const params = new URLSearchParams();
            if (gender) params.set('gender', gender);
            if (age) params.set('age', age);
            if (accent) params.set('accent', accent);
            if (query) params.set('q', query);

            const res = await fetch(`/api/voice/search?${params}`, {
                headers: { Authorization: `Bearer ${idToken}` },
            });
            if (res.ok) {
                const data = await res.json();
                setResults(data.voices || []);
            } else {
                console.error('[VoiceBrowser] Search failed:', res.status, await res.text().catch(() => ''));
            }
        } catch (err) {
            console.error('[VoiceBrowser] Search error:', err);
        } finally {
            setLoading(false);
        }
    }, [user, gender, age, accent, query, stopPlaying]);

    const playPreview = useCallback((voice: VoiceResult) => {
        stopPlaying();
        if (playingId === voice.voice_id) return;
        if (!voice.preview_url) return;

        const audio = new Audio(voice.preview_url);
        audio.onended = () => setPlayingId(null);
        audio.onerror = () => setPlayingId(null);
        audio.play();
        audioRef.current = audio;
        setPlayingId(voice.voice_id);
    }, [playingId, stopPlaying]);

    const selectVoice = useCallback(async (voice: VoiceResult) => {
        if (!user || selectingId) return;
        setSelectingId(voice.voice_id);

        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/voice/select', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ voiceId: voice.voice_id, voiceName: voice.name }),
            });

            if (res.ok) {
                setSelectedId(voice.voice_id);
                setSelectedName(voice.name);
            }
        } catch (err) {
            console.error('[VoiceBrowser] Select failed:', err);
        } finally {
            setSelectingId(null);
        }
    }, [user, selectingId]);

    // Cleanup on unmount
    useEffect(() => () => stopPlaying(), [stopPlaying]);

    // Search on filter change
    useEffect(() => {
        if (isOpen) search();
    }, [gender, age, accent]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-bold">
                    My Voice
                </p>
                <button
                    onClick={() => { setIsOpen(!isOpen); if (!isOpen && results.length === 0) search(); }}
                    className="text-[10px] font-bold text-zinc-500 hover:text-white transition-colors"
                >
                    {isOpen ? 'Close' : 'Change'}
                </button>
            </div>

            {/* Current voice */}
            {selectedName && !isOpen && (
                <p className="text-sm text-zinc-300 mt-1">{selectedName}</p>
            )}
            {!selectedName && !isOpen && (
                <p className="text-sm text-zinc-500 italic mt-1">No voice selected</p>
            )}

            {/* Search panel */}
            {isOpen && (
                <div className="mt-3 space-y-3">
                    {/* Filters */}
                    <div className="flex flex-wrap gap-2">
                        <select
                            value={gender}
                            onChange={e => setGender(e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-zinc-500"
                        >
                            <option value="">Any Gender</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                        </select>
                        <select
                            value={age}
                            onChange={e => setAge(e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-zinc-500"
                        >
                            <option value="">Any Age</option>
                            <option value="young">Young</option>
                            <option value="middle_aged">Middle Aged</option>
                            <option value="old">Senior</option>
                        </select>
                        <select
                            value={accent}
                            onChange={e => setAccent(e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-zinc-500"
                        >
                            <option value="">Any Accent</option>
                            <option value="american">American</option>
                            <option value="british">British</option>
                            <option value="african">African</option>
                            <option value="australian">Australian</option>
                            <option value="indian">Indian</option>
                            <option value="latin american">Latin American</option>
                            <option value="spanish">Spanish</option>
                        </select>
                    </div>

                    {/* Text search */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && search()}
                            placeholder="Search voices..."
                            className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                        />
                        <button
                            onClick={search}
                            disabled={loading}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white text-xs font-bold px-3 py-2 rounded-lg transition-all disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
                        </button>
                    </div>

                    {/* Results */}
                    <div className="space-y-2 max-h-[320px] overflow-y-auto">
                        {results.map(voice => {
                            const isPlaying = playingId === voice.voice_id;
                            const isSelected = selectedId === voice.voice_id;
                            const isSelecting = selectingId === voice.voice_id;

                            return (
                                <div
                                    key={voice.voice_id}
                                    className={cn(
                                        "flex items-center gap-3 p-3 rounded-lg border transition-all",
                                        isSelected
                                            ? "border-white/20 bg-zinc-800/50"
                                            : "border-zinc-800/50 bg-zinc-950/30 hover:bg-zinc-900/50"
                                    )}
                                >
                                    <button
                                        onClick={() => playPreview(voice)}
                                        className={cn(
                                            "shrink-0 w-10 h-10 flex items-center justify-center rounded-full border transition-all",
                                            isPlaying
                                                ? "bg-white/10 border-white/20 animate-pulse"
                                                : "bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                                        )}
                                        aria-label={`Play ${voice.name}`}
                                    >
                                        <Volume2 className={cn("w-4 h-4", isPlaying ? "text-white" : "text-zinc-400")} />
                                    </button>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-zinc-300 font-medium truncate">{voice.name}</p>
                                        <p className="text-[10px] text-zinc-600 truncate">
                                            {[voice.accent, voice.age?.replace('_', ' '), voice.category].filter(Boolean).join(' · ')}
                                        </p>
                                    </div>

                                    {isSelected ? (
                                        <div className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-zinc-400">
                                            <Check className="w-3.5 h-3.5" />
                                            Active
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => selectVoice(voice)}
                                            disabled={!!isSelecting}
                                            className="shrink-0 text-xs font-bold text-zinc-500 hover:text-white px-3 py-1.5 rounded-full border border-zinc-700 hover:border-zinc-500 transition-all disabled:opacity-50"
                                        >
                                            {isSelecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Select'}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                        {!loading && results.length === 0 && (
                            <p className="text-xs text-zinc-600 text-center py-4">No voices found. Try different filters.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

