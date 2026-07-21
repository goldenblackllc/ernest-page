"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useAudioMute, PAUSE_ALL_AUDIO_EVENT } from "@/context/AudioMuteContext";
import ReactMarkdown from "react-markdown";
import { useTranslations } from "next-intl";

interface DigestCardProps {
    title: string;
    content: string;
    imageUrl?: string | null;
    audioUrl?: string | null;
}

export function DigestCard({ title, content, imageUrl, audioUrl }: DigestCardProps) {
    const t = useTranslations('feed');
    // Strip bold lead-ins like "**The Home:** " from content
    const cleanContent = content.replace(/^\*\*[^*]+:\*\*\s*/gm, '');

    // ═══ GLOBAL MUTE STATE ═══
    const { isMuted, toggleMute, pauseAll, isAutoPlaySuppressed } = useAudioMute();

    // Audio state
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioProgress, setAudioProgress] = useState(0);
    const cardRef = useRef<HTMLDivElement>(null);

    // Stable refs — prevent IntersectionObserver re-creation on every state change
    const isPlayingRef = useRef(false);
    const toggleAudioRef = useRef<() => void>(() => {});
    const isAutoPlaySuppressedRef = useRef(false);
    const hasCompletedRef = useRef(false);

    const canPlayShort = Boolean(audioUrl && imageUrl);

    const toggleAudio = useCallback(() => {
        if (!audioUrl) return;

        // If already playing, pause
        if (isPlaying && audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
            return;
        }

        // Start from the beginning if idle
        if (!audioRef.current) {
            // Pause any other playing cards first
            pauseAll();

            const audio = new Audio(audioUrl);
            audio.muted = isMuted;
            audioRef.current = audio;

            audio.ontimeupdate = () => {
                if (audio.duration) setAudioProgress(audio.currentTime / audio.duration);
            };

            audio.onended = () => {
                setIsPlaying(false);
                setAudioProgress(0);
                audioRef.current = null;
                hasCompletedRef.current = true;
            };

            audio.play().catch(() => setIsPlaying(false));
            setIsPlaying(true);
        } else {
            // Resume paused audio
            audioRef.current.play().catch(() => setIsPlaying(false));
            setIsPlaying(true);
        }
    }, [audioUrl, isPlaying, isMuted, pauseAll]);

    // Keep refs in sync so IntersectionObserver callback reads fresh values
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
    useEffect(() => { toggleAudioRef.current = toggleAudio; }, [toggleAudio]);
    useEffect(() => { isAutoPlaySuppressedRef.current = isAutoPlaySuppressed; }, [isAutoPlaySuppressed]);

    // Auto-play when card scrolls into view, pause when it leaves (Instagram Reels behavior)
    // Deps only include stable values — refs prevent observer re-creation on play/pause
    useEffect(() => {
        if (!canPlayShort || !cardRef.current) return;

        let pauseTimer: ReturnType<typeof setTimeout> | null = null;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    // Card scrolled back into view — cancel any pending pause
                    if (pauseTimer) { clearTimeout(pauseTimer); pauseTimer = null; }
                    if (!isPlayingRef.current && !isAutoPlaySuppressedRef.current && !hasCompletedRef.current) {
                        toggleAudioRef.current();
                    }
                } else {
                    // Debounce the pause — prevents flicker when card bounces near threshold
                    if (pauseTimer) clearTimeout(pauseTimer);
                    pauseTimer = setTimeout(() => {
                        if (isPlayingRef.current && audioRef.current) {
                            audioRef.current.pause();
                            audioRef.current.currentTime = 0;
                            audioRef.current = null;
                            setIsPlaying(false);
                            setAudioProgress(0);
                        }
                        hasCompletedRef.current = false;
                    }, 300);
                }
            },
            { threshold: 0.6 }
        );

        observer.observe(cardRef.current);
        return () => {
            observer.disconnect();
            if (pauseTimer) clearTimeout(pauseTimer);
        };
    }, [canPlayShort]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // Pause when a global pause-all signal is dispatched (e.g. another card starts playing)
    useEffect(() => {
        const handlePauseAll = () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
                audioRef.current = null;
            }
            setIsPlaying(false);
            setAudioProgress(0);
        };
        window.addEventListener(PAUSE_ALL_AUDIO_EVENT, handlePauseAll);
        return () => window.removeEventListener(PAUSE_ALL_AUDIO_EVENT, handlePauseAll);
    }, []);

    // Sync global mute state to active audio element
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.muted = isMuted;
        }
    }, [isMuted]);

    // Sentence-boundary chunking — matches FeedPostCard behavior
    const chunkText = (text: string, targetWords: number = 7): string[] => {
        const cleaned = text.replace(/\n+/g, ' ').replace(/\*\*[^*]+:\*\*\s*/g, '').trim();
        if (!cleaned) return [''];

        const sentencePattern = /[^.!?]*[.!?]+[\s]*/g;
        const sentences = cleaned.match(sentencePattern);
        if (!sentences || sentences.length === 0) return [cleaned];

        const matchedLength = sentences.reduce((sum, s) => sum + s.length, 0);
        if (matchedLength < cleaned.length) {
            sentences.push(cleaned.slice(matchedLength));
        }

        const chunks: string[] = [];
        let current = '';
        let wordCount = 0;

        for (const sentence of sentences) {
            const sentenceWords = sentence.trim().split(/\s+/).filter(w => w).length;
            if (wordCount > 0 && wordCount + sentenceWords > targetWords) {
                chunks.push(current.trim());
                current = sentence;
                wordCount = sentenceWords;
            } else {
                current += sentence;
                wordCount += sentenceWords;
            }
        }
        if (current.trim()) chunks.push(current.trim());
        return chunks.length > 0 ? chunks : [''];
    };

    // ═══ SHORT-FORM MODE ═══
    if (canPlayShort) {
        const chunks = chunkText(cleanContent);

        // Word-count-weighted estimation — longer chunks get proportionally more time
        const wordCounts = chunks.map(c => c.split(/\s+/).length);
        const totalWords = wordCounts.reduce((a, b) => a + b, 0);
        let cumulative = 0;
        let lineIndex = 0;
        for (let i = 0; i < chunks.length; i++) {
            cumulative += wordCounts[i] / totalWords;
            if (audioProgress < cumulative) {
                lineIndex = i;
                break;
            }
            lineIndex = i;
        }

        const subtitleText = isPlaying ? chunks[lineIndex] : chunks[0];
        const showSubtitle = Boolean(subtitleText);

        return (
            <div ref={cardRef} className="bg-black border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-lg relative font-sans">
                <div
                    className="relative w-full cursor-pointer overflow-hidden"
                    style={{ aspectRatio: '4 / 5' }}
                    onClick={toggleAudio}
                    title="Tap to pause/resume"
                >
                    <img
                        src={imageUrl!}
                        alt={title}
                        className="absolute inset-0 w-full h-full object-cover"
                    />

                    {/* Top: Label + Title + Mute */}
                    <div className="absolute top-0 left-0 right-0 p-4 z-10" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.7))' }}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-bold mb-1">
                                    {t('digestLabel')}
                                </p>
                                <h2 className="text-lg font-black text-white leading-tight">
                                    {title}
                                </h2>
                            </div>
                            {/* Mute toggle — always visible */}
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                                className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1 border border-white/10 transition-all duration-200 active:scale-95 shrink-0 mt-1"
                            >
                                {isMuted ? (
                                    <VolumeX className="w-3.5 h-3.5 text-white/70" />
                                ) : (
                                    <Volume2 className="w-3.5 h-3.5 text-white animate-pulse" />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Subtitle text — larger karaoke-style typography */}
                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none px-5">
                        <div className={`text-center max-w-[94%] transition-opacity duration-300 ${showSubtitle ? 'opacity-100' : 'opacity-0'}`}>
                            <p className="text-[1.75rem] sm:text-4xl lg:text-5xl font-black text-white leading-snug" style={{ whiteSpace: 'pre-line', textShadow: '-2px -2px 0 rgba(0,0,0,0.9), 2px -2px 0 rgba(0,0,0,0.9), -2px 2px 0 rgba(0,0,0,0.9), 2px 2px 0 rgba(0,0,0,0.9), 0 3px 6px rgba(0,0,0,0.5)' }}>
                                {subtitleText || '\u00A0'}
                            </p>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 z-20">
                        <div
                            className="h-full bg-white/70 transition-all duration-200"
                            style={{ width: `${audioProgress * 100}%` }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    // ═══ STANDARD TEXT MODE ═══
    return (
        <div ref={cardRef} className="bg-[#1a1a1a] border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-sm backdrop-blur-sm font-sans">
            <div className="px-4 sm:px-5 py-4 sm:py-5">
                {imageUrl && (
                    <div className="mb-4">
                        <img
                            src={imageUrl}
                            alt=""
                            className="w-full aspect-video object-cover rounded-xl"
                        />
                    </div>
                )}

                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
                    {t('digestLabel')}
                </p>
                <h3 className="text-base sm:text-lg font-bold text-white mb-1 sm:mb-2 leading-tight">
                    {title}
                </h3>

                <div className="text-sm sm:text-[15px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    <ReactMarkdown>{cleanContent}</ReactMarkdown>
                </div>
            </div>
        </div>
    );
}
