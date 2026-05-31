"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils";
import { Loader2, Volume2, Check } from "lucide-react";

export interface VoiceResult {
    voice_id: string;
    name: string;
    accent: string;
    age: string;
    gender: string;
    category: string;
    description: string;
    preview_url: string;
}

interface VoiceBrowserProps {
    currentVoiceId?: string;
    currentVoiceName?: string;
    /** If true, the browser starts expanded (used on feed card). Defaults to false (collapsed in profile). */
    startOpen?: boolean;
    /** Called after a voice is successfully selected. */
    onVoiceSelected?: (voiceId: string, voiceName: string) => void;
}

export function VoiceBrowser({ currentVoiceId, currentVoiceName, startOpen = false, onVoiceSelected }: VoiceBrowserProps) {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(startOpen);
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
                onVoiceSelected?.(voice.voice_id, voice.name);
            }
        } catch (err) {
            console.error('[VoiceBrowser] Select failed:', err);
        } finally {
            setSelectingId(null);
        }
    }, [user, selectingId, onVoiceSelected]);

    // Cleanup on unmount
    useEffect(() => () => stopPlaying(), [stopPlaying]);

    // Search on filter change
    useEffect(() => {
        if (isOpen) search();
    }, [gender, age, accent]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-search when starting open
    useEffect(() => {
        if (startOpen && results.length === 0) search();
    }, [startOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
