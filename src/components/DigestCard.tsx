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
            };

            audio.play().catch(() => setIsPlaying(false));
            setIsPlaying(true);
        } else {
            // Resume paused audio
            audioRef.current.play().catch(() => setIsPlaying(false));
            setIsPlaying(true);
        }
    }, [audioUrl, isPlaying, isMuted, pauseAll]);

    // Auto-play when card scrolls into view, pause when it leaves (Instagram Reels behavior)
    useEffect(() => {
        if (!canPlayShort || !cardRef.current) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    if (!isPlaying && !isAutoPlaySuppressed) {
                        toggleAudio();
                    }
                } else if (isPlaying && audioRef.current) {
                    // Card scrolled away — pause and reset
                    audioRef.current.pause();
                    audioRef.current.currentTime = 0;
                    audioRef.current = null;
                    setIsPlaying(false);
                    setAudioProgress(0);
                }
            },
            { threshold: 0.6 }
        );

        observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, [canPlayShort, toggleAudio, isPlaying, isAutoPlaySuppressed]);

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
    const chunkText = (text: string, targetWords: number = 35): string[] => {
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
        const lineIndex = Math.min(Math.floor(audioProgress * chunks.length), chunks.length - 1);
        const subtitle = isPlaying ? chunks[lineIndex] : null;

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

                    {/* Subtitle text — centered */}
                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none px-8">
                        {subtitle && (
                            <div className="text-center">
                                <p className="text-xl sm:text-3xl lg:text-4xl font-bold text-white leading-snug transition-all duration-200" style={{ whiteSpace: 'pre-line', WebkitTextStroke: '1px rgba(0,0,0,0.7)', textShadow: '0 2px 12px rgba(0,0,0,1), 0 4px 24px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.5)' }}>
                                    {subtitle}
                                </p>
                            </div>
                        )}
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
