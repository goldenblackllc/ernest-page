"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Play, Pause, Volume2 } from "lucide-react";
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

    // Audio state
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioProgress, setAudioProgress] = useState(0);
    const cardRef = useRef<HTMLDivElement>(null);
    const hasAutoPlayed = useRef(false);

    const canPlayShort = Boolean(audioUrl && imageUrl);

    const toggleAudio = useCallback(() => {
        if (!audioUrl) return;

        if (isPlaying && audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
            return;
        }

        const audio = audioRef.current || new Audio();
        audioRef.current = audio;
        audio.src = audioUrl;

        audio.ontimeupdate = () => {
            if (audio.duration) setAudioProgress(audio.currentTime / audio.duration);
        };

        audio.onended = () => {
            setIsPlaying(false);
            setAudioProgress(0);
        };

        audio.play();
        setIsPlaying(true);
    }, [audioUrl, isPlaying]);

    // Autoplay when scrolled into view
    useEffect(() => {
        if (!canPlayShort || !cardRef.current) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !hasAutoPlayed.current) {
                    hasAutoPlayed.current = true;
                    toggleAudio();
                } else if (!entry.isIntersecting && isPlaying && audioRef.current) {
                    audioRef.current.pause();
                    setIsPlaying(false);
                }
            },
            { threshold: 0.6 }
        );

        observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, [canPlayShort, toggleAudio, isPlaying]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // Subtitle chunks for synced text
    const chunkText = (text: string, wordsPerChunk: number = 12): string[] => {
        const words = text.replace(/\n+/g, ' ').replace(/\*\*[^*]+:\*\*\s*/g, '').split(/\s+/).filter(w => w);
        const chunks: string[] = [];
        for (let i = 0; i < words.length; i += wordsPerChunk) {
            chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
        }
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
                >
                    <img
                        src={imageUrl!}
                        alt={title}
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80" />

                    {/* Top: Label + Title */}
                    <div className="absolute top-0 left-0 right-0 p-4 z-10">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold mb-1">
                            {t('digestLabel')}
                        </p>
                        <h2 className="text-lg font-black text-white leading-tight drop-shadow-lg">
                            {title}
                        </h2>
                        {isPlaying && (
                            <div className="flex items-center gap-1.5 mt-2 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1 border border-white/10 w-fit">
                                <Volume2 className="w-3 h-3 text-white animate-pulse" />
                                <span className="text-[10px] font-bold text-white uppercase tracking-wider">Playing</span>
                            </div>
                        )}
                    </div>

                    {/* Center play button */}
                    {!isPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                            <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center">
                                <Play className="w-7 h-7 text-white ml-1" fill="white" />
                            </div>
                        </div>
                    )}

                    {/* Bottom: Subtitle */}
                    <div className="absolute bottom-4 left-4 right-4 z-10">
                        {isPlaying && subtitle ? (
                            <p className="text-base text-white font-medium leading-relaxed drop-shadow-lg animate-[fadeInUp_0.3s_ease-out]" key={subtitle}>
                                {subtitle}
                            </p>
                        ) : (
                            <div>
                                <p className="text-[13px] text-white/60 leading-snug drop-shadow-lg line-clamp-2">
                                    {chunks[0]}
                                </p>
                                <p className="text-[11px] text-white/30 mt-1.5 uppercase tracking-widest font-bold">
                                    Tap to listen
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
