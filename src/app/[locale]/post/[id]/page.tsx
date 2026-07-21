"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Play, Pause, Heart, MessageCircle, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { use } from "react";

export default function PostPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
    const { id } = use(params);
    const [post, setPost] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Audio state
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioPhase, setAudioPhase] = useState<'idle' | 'letter' | 'response'>('idle');
    const [audioProgress, setAudioProgress] = useState(0);

    useEffect(() => {
        fetch(`/api/posts/${id}`)
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    setError(data.error);
                } else {
                    setPost(data.post);
                }
            })
            .catch(() => setError("Failed to load post"))
            .finally(() => setLoading(false));
    }, [id]);

    // Audio toggle
    const toggleAudio = useCallback(() => {
        if (!post) return;
        const unifiedUrl = post.audio_url;
        const hasLegacyAudio = post.letter_audio_url && post.response_audio_url;
        if (!unifiedUrl && !hasLegacyAudio) return;

        if (isPlaying && audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
            return;
        }

        const audio = audioRef.current || new Audio();
        audioRef.current = audio;

        if (audioPhase === 'idle' || audioPhase === 'response') {
            if (unifiedUrl) {
                audio.src = unifiedUrl;
            } else {
                audio.src = post.letter_audio_url;
            }
            setAudioPhase('letter');
        }

        // Compute letter ratio for phase boundary
        const letterRatio = post.audio_letter_ratio ?? (() => {
            const letter = post.public_post?.letter || '';
            const response = post.public_post?.response || '';
            const lw = letter.split(/\s+/).filter(Boolean).length;
            const rw = response.split(/\s+/).filter(Boolean).length;
            return (lw + rw) > 0 ? lw / (lw + rw) : 0.5;
        })();

        if (unifiedUrl) {
            // Unified: single audio, estimate phase from ratio
            audio.ontimeupdate = () => {
                if (audio.duration) {
                    const progress = audio.currentTime / audio.duration;
                    setAudioProgress(progress);
                    const newPhase = progress < letterRatio ? 'letter' : 'response';
                    setAudioPhase(prev => prev !== newPhase && prev !== 'idle' ? newPhase : prev);
                }
            };
            audio.onended = () => {
                setIsPlaying(false);
                setAudioPhase('idle');
                setAudioProgress(0);
            };
        } else {
            // Legacy: two files
            audio.ontimeupdate = () => {
                if (audio.duration) {
                    setAudioProgress(audio.currentTime / audio.duration);
                }
            };
            audio.onended = () => {
                if (audioPhase === 'letter' || audio.src.includes('_letter')) {
                    audio.src = post.response_audio_url;
                    setAudioPhase('response');
                    setAudioProgress(0);
                    audio.play();
                } else {
                    setIsPlaying(false);
                    setAudioPhase('idle');
                    setAudioProgress(0);
                }
            };
        }

        audio.play();
        setIsPlaying(true);
    }, [post, isPlaying, audioPhase]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // Share handler
    const handleShare = useCallback(async () => {
        const url = window.location.href;
        const text = post?.public_post?.title || 'Check out this post on Earnest Page';
        try {
            if (navigator.share) {
                await navigator.share({ title: text, url });
            } else {
                await navigator.clipboard.writeText(url);
            }
        } catch { /* cancelled */ }
    }, [post]);

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="w-10 h-10 rounded-full border-2 border-zinc-700 border-t-white animate-spin" />
            </div>
        );
    }

    if (error || !post) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center px-8">
                    <h1 className="text-xl font-bold text-white mb-2">Post not found</h1>
                    <p className="text-zinc-500 text-sm mb-6">This post may be private or no longer exists.</p>
                    <a href="/" className="text-sm text-white underline underline-offset-4 hover:text-zinc-300">
                        Visit Earnest Page
                    </a>
                </div>
            </div>
        );
    }

    const publicTitle = post.public_post?.title;
    const publicLetter = post.public_post?.letter;
    const publicResponse = post.public_post?.response;
    const heroUrl = post.imagen_url || post.public_post?.imagen_url;
    const hasAudio = Boolean(post.audio_url || (post.letter_audio_url && post.response_audio_url));

    // Subtitle chunks
    const chunkText = (text: string, wordsPerChunk: number = 7): string[] => {
        const words = text.replace(/\n+/g, ' ').split(/\s+/).filter(w => w);
        const chunks: string[] = [];
        for (let i = 0; i < words.length; i += wordsPerChunk) {
            chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
        }
        return chunks.length > 0 ? chunks : [''];
    };

    const letterChunks = chunkText(publicLetter || '');
    const responseChunks = chunkText((publicResponse || '').replace(/^THE COUNSEL:\s*/i, ''));

    // Build timestamp-based chunks with per-word data for karaoke
    const wordTimestamps = post.audio_word_timestamps as { word: string; start: number; end: number }[] | undefined;
    const timestampChunks = (() => {
        if (!wordTimestamps || wordTimestamps.length === 0) return null;
        const filtered = wordTimestamps.filter(w => w.word !== '...' && w.word !== '\u2026');
        if (filtered.length === 0) return null;

        const chunks: { text: string; start: number; end: number; words: { word: string; start: number; end: number }[] }[] = [];
        const minWords = 3;
        const targetWords = 7;
        const hardCeiling = Math.ceil(targetWords * 1.5);
        let chunkStart = 0;

        for (let i = 0; i < filtered.length; i++) {
            const wordCount = i - chunkStart + 1;
            const word = filtered[i].word;
            const isSentenceEnd = /[.!?]/.test(word);
            const isNaturalPause = /[,;\u2014\u2013\-]/.test(word);
            const isLastWord = i === filtered.length - 1;

            const shouldBreak =
                (isSentenceEnd && wordCount >= minWords) ||
                (isNaturalPause && wordCount >= targetWords) ||
                (wordCount >= hardCeiling) ||
                isLastWord;

            if (shouldBreak) {
                const group = filtered.slice(chunkStart, i + 1);
                chunks.push({
                    text: group.map(w => w.word).join(' '),
                    start: group[0].start,
                    end: group[group.length - 1].end,
                    words: group.map(w => ({ word: w.word, start: w.start, end: w.end })),
                });
                chunkStart = i + 1;
            }
        }
        return chunks.length > 0 ? chunks : null;
    })();

    const getCurrentSubtitle = (): { current: string; words?: { word: string; start: number; end: number }[]; activeWordIndex: number } | null => {
        if (audioPhase === 'idle' && !isPlaying) return null;

        // Timestamp-based sync with karaoke
        if (timestampChunks && audioRef.current) {
            const currentTime = audioRef.current.currentTime;
            let chunkIndex = 0;
            for (let i = 0; i < timestampChunks.length; i++) {
                if (currentTime >= timestampChunks[i].start) {
                    chunkIndex = i;
                } else {
                    break;
                }
            }
            const chunk = timestampChunks[chunkIndex];
            let activeWordIndex = 0;
            if (chunk?.words) {
                for (let w = 0; w < chunk.words.length; w++) {
                    if (currentTime >= chunk.words[w].start) {
                        activeWordIndex = w;
                    } else {
                        break;
                    }
                }
            }
            return { current: chunk?.text || '', words: chunk?.words, activeWordIndex };
        }

        // Fallback: word-count estimate
        const lines = audioPhase === 'response' ? responseChunks : letterChunks;
        if (lines.length === 0) return null;
        const lineIndex = Math.min(Math.floor(audioProgress * lines.length), lines.length - 1);
        return { current: lines[lineIndex], activeWordIndex: -1 };
    };

    const subtitle = getCurrentSubtitle();
    const isShort = hasAudio && heroUrl;

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            {/* OG Meta via head */}
            <title>{publicTitle || 'Earnest Page'}</title>
            <meta property="og:title" content={publicTitle || 'Earnest Page'} />
            <meta property="og:description" content={publicLetter?.slice(0, 160) || 'A letter on Earnest Page'} />
            {heroUrl && <meta property="og:image" content={heroUrl} />}
            <meta property="og:type" content="article" />

            <div className="w-full max-w-[420px]">
                {isShort ? (
                    /* Short-form rendering */
                    <div className="bg-black border border-white/10 rounded-xl overflow-hidden shadow-lg relative font-sans">
                        <div
                            className="relative w-full cursor-pointer overflow-hidden"
                            style={{ aspectRatio: '4 / 5' }}
                            onClick={toggleAudio}
                        >
                            <img
                                src={heroUrl}
                                alt={publicTitle || ""}
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                            {/* Gradient overlays */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/50 z-10" />

                            {/* Title + Branding */}
                            <div className="absolute top-4 left-4 right-4 z-20">
                                <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold mb-1">Earnest Page</p>
                                <h2 className="text-lg font-bold text-white leading-tight drop-shadow-lg">{publicTitle}</h2>
                            </div>

                            {/* Play/Pause indicator */}
                            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                                {!isPlaying && (
                                    <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/20">
                                        <Play className="w-7 h-7 text-white ml-1" fill="white" />
                                    </div>
                                )}
                            </div>

                            {/* Subtitle — karaoke word-highlight style */}
                            <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none px-5">
                                {isPlaying && subtitle ? (
                                    <div className="text-center max-w-[94%]">
                                        <p className="text-[1.75rem] sm:text-4xl font-black text-white leading-snug" style={{ textShadow: '-2px -2px 0 rgba(0,0,0,0.9), 2px -2px 0 rgba(0,0,0,0.9), -2px 2px 0 rgba(0,0,0,0.9), 2px 2px 0 rgba(0,0,0,0.9), 0 3px 6px rgba(0,0,0,0.5)' }}>
                                            {subtitle.words && subtitle.activeWordIndex >= 0 ? (
                                                subtitle.words.map((w: { word: string }, i: number) => (
                                                    <span
                                                        key={i}
                                                        className={`transition-colors duration-100 ${i === subtitle.activeWordIndex ? 'text-amber-300' : 'text-white'}`}
                                                    >
                                                        {w.word}{i < (subtitle.words?.length ?? 0) - 1 ? ' ' : ''}
                                                    </span>
                                                ))
                                            ) : (
                                                subtitle.current
                                            )}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="text-center max-w-[94%]">
                                        <p className="text-lg text-white/60 font-bold leading-snug drop-shadow-lg line-clamp-2">
                                            {letterChunks[0]}
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

                        {/* Footer */}
                        <div className="flex items-center justify-between px-4 py-2.5 bg-black/60 border-t border-white/5">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5 text-zinc-400">
                                    <Heart className="w-5 h-5" />
                                    {post.like_count > 0 && <span className="text-xs font-medium">{post.like_count}</span>}
                                </div>
                                <div className="flex items-center gap-1.5 text-zinc-400">
                                    <MessageCircle className="w-5 h-5" />
                                    {post.comments > 0 && <span className="text-xs font-medium">{post.comments}</span>}
                                </div>
                            </div>
                            <button onClick={handleShare} className="text-zinc-400 hover:text-white transition-colors p-1">
                                <Share2 className="w-4 h-4" />
                            </button>
                        </div>

                        {/* CTA */}
                        <div className="px-4 py-3 border-t border-white/5 text-center">
                            <a
                                href="/"
                                className="text-sm text-white font-medium hover:underline underline-offset-4"
                            >
                                Try Earnest Page →
                            </a>
                        </div>
                    </div>
                ) : (
                    /* Text card fallback */
                    <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden shadow-lg p-6 font-sans">
                        {heroUrl && (
                            <div className="relative w-full aspect-video rounded-lg overflow-hidden mb-4">
                                <img src={heroUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                            </div>
                        )}
                        <h1 className="text-xl font-bold text-white mb-3">{publicTitle}</h1>
                        <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap mb-4">{publicLetter}</div>
                        <div className="border-t border-white/10 pt-4 mt-4">
                            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-2">The Response</p>
                            <div className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">{publicResponse}</div>
                        </div>
                        <div className="mt-6 text-center border-t border-white/10 pt-4">
                            <a href="/" className="text-sm text-white font-medium hover:underline underline-offset-4">
                                Try Earnest Page →
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
