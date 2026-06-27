"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { User, Heart, MessageCircle, Clock, Volume2, VolumeX, RotateCcw } from "lucide-react";
import { useAudioMute, PAUSE_ALL_AUDIO_EVENT } from "@/context/AudioMuteContext";
import { cn } from "@/lib/utils";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface ShowcasePost {
    id: string;
    type: string;
    post_type?: string | null;
    title?: string | null;
    pseudonym?: string | null;
    letter?: string | null;
    response?: string | null;
    imagen_url?: string | null;
    user_photo_url?: string | null;
    audio_url?: string | null;
    audio_letter_ratio?: number | null;
    audio_word_timestamps?: { word: string; start: number; end: number }[] | null;
    directive_title?: string | null;
    unexpected_yield?: string | null;
    author_avatar_url?: string | null;
    like_count?: number;
    comments?: number;
    created_at?: { _seconds: number; _nanoseconds: number } | null;
}

interface ShowcasePostCardProps {
    post: ShowcasePost;
    onInteract: () => void;
    onExpandChange?: (expanded: boolean) => void;
    onAudioPlayingChange?: (isPlaying: boolean) => void;
}

function timeAgo(seconds: number): string {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - seconds;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return `${Math.floor(diff / 604800)}w ago`;
}

export function ShowcasePostCard({ post, onInteract, onExpandChange, onAudioPlayingChange }: ShowcasePostCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const pseudonym = post.pseudonym || 'Anonymous';
    const isRealityShift = post.post_type === 'reality_shift';
    const title = post.title || post.directive_title;

    // ═══ GLOBAL MUTE STATE ═══
    const { isMuted, toggleMute } = useAudioMute();

    // ═══ SHORT-FORM DETECTION ═══
    const hasAudio = Boolean(post.audio_url);
    const heroUrl = post.user_photo_url || post.imagen_url;
    const canPlayShort = hasAudio && Boolean(heroUrl);

    // ═══ AUDIO PLAYBACK STATE ═══
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioPhase, setAudioPhase] = useState<'idle' | 'letter' | 'response'>('idle');
    const [audioProgress, setAudioProgress] = useState(0);
    const cardRef = useRef<HTMLDivElement>(null);
    const hasAutoPlayed = useRef(false);

    // Parse letter content
    const rawLetter = isRealityShift ? (post.unexpected_yield || '') : (post.letter || '');
    const rawResponse = post.response || '';

    // Compute letter word ratio for phase boundary estimation
    const computedLetterRatio = (() => {
        if (post.audio_letter_ratio != null) return post.audio_letter_ratio;
        const lw = rawLetter.split(/\s+/).filter(Boolean).length;
        const rw = rawResponse.split(/\s+/).filter(Boolean).length;
        const total = lw + rw;
        return total > 0 ? lw / total : 0.5;
    })();

    // Audio toggle handler
    const toggleAudio = useCallback(() => {
        if (!hasAudio) return;

        if (isPlaying && audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
            return;
        }

        if (audioPhase === 'idle' || !audioRef.current) {
            const audio = new Audio(post.audio_url!);
            audio.muted = isMuted;
            audioRef.current = audio;
            setAudioPhase('letter');

            audio.ontimeupdate = () => {
                if (audio.duration) {
                    const progress = audio.currentTime / audio.duration;
                    setAudioProgress(progress);
                    const newPhase = progress < computedLetterRatio ? 'letter' : 'response';
                    setAudioPhase(prev => prev !== newPhase && prev !== 'idle' ? newPhase : prev);
                }
            };

            audio.onended = () => {
                setIsPlaying(false);
                setAudioPhase('idle');
                setAudioProgress(0);
                audioRef.current = null;
            };

            audio.play().catch(() => setIsPlaying(false));
            setIsPlaying(true);
        } else {
            audioRef.current.play().catch(() => setIsPlaying(false));
            setIsPlaying(true);
        }
    }, [isPlaying, audioPhase, post.audio_url, computedLetterRatio, hasAudio, isMuted]);

    // Autoplay when card scrolls into view
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

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // Pause when a global pause-all signal is dispatched (e.g. MirrorChat opens)
    useEffect(() => {
        const handlePauseAll = () => {
            if (audioRef.current) {
                audioRef.current.pause();
                setIsPlaying(false);
            }
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

    // Notify parent when audio playing state changes (for carousel pause)
    useEffect(() => {
        onAudioPlayingChange?.(isPlaying);
    }, [isPlaying, onAudioPlayingChange]);

    // Parse letter: extract greeting and body
    let greeting: string | null = null;
    let letterBody = rawLetter;
    if (!isRealityShift && rawLetter) {
        const lines = rawLetter.split('\n');
        if (/^dear\s/i.test(lines[0]?.trim() || '')) {
            greeting = lines[0].trim();
            letterBody = lines.slice(1).join('\n').trimStart();
        }
        // Strip trailing pseudonym sign-off
        letterBody = letterBody.replace(/\n-\s*.+$/, '').trim();
    }

    const timestamp = post.created_at?._seconds
        ? timeAgo(post.created_at._seconds)
        : '';

    const likes = post.like_count || 0;
    const commentCount = post.comments || 0;

    // ═══ SHORT-FORM VIDEO MODE ═══
    if (canPlayShort) {
        // Sentence-boundary chunking — matches FeedPostCard behavior
        const chunkText = (text: string, targetWords: number = 35): string[] => {
            const cleaned = text.replace(/\n+/g, ' ').trim();
            if (!cleaned) return [''];

            const sentencePattern = /[^.!?]*[.!?]+[\s]*/g;
            const sentences = cleaned.match(sentencePattern);
            if (!sentences || sentences.length === 0) return [cleaned];

            // Capture trailing text after last sentence boundary
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

        const letterChunks = chunkText(rawLetter);
        const responseChunks = chunkText(rawResponse.replace(/^THE COUNSEL:\s*/i, ''));
        const allChunks = [...letterChunks, ...responseChunks];

        // Build timestamp-based chunks at sentence boundaries if word timestamps are available
        const wordTimestamps = post.audio_word_timestamps;
        const timestampChunks: { text: string; start: number; end: number }[] | null = (() => {
            if (!wordTimestamps || wordTimestamps.length === 0) return null;

            // Filter out ellipsis tokens that leak from TTS separators
            const filtered = wordTimestamps.filter((w) => w.word !== '...' && w.word !== '\u2026');
            if (filtered.length === 0) return null;

            // Determine letter/response boundary from word ratio
            const splitIndex = Math.round(filtered.length * computedLetterRatio);

            const chunks: { text: string; start: number; end: number }[] = [];
            const tgtWords = 35;
            const hardCeiling = Math.ceil(tgtWords * 1.5);
            let chunkStart = 0;

            for (let i = 0; i < filtered.length; i++) {
                const wc = i - chunkStart + 1;
                const word = filtered[i].word;
                const isSentenceEnd = /[.!?]/.test(word);
                const isNaturalPause = /[,;\u2014\u2013\-]/.test(word);
                const isLastWord = i === filtered.length - 1;
                const isLetterEnd = splitIndex > 0 && i === splitIndex - 1;

                const shouldBreak =
                    (isSentenceEnd && wc >= tgtWords) ||
                    isLetterEnd ||
                    (isNaturalPause && wc >= hardCeiling) ||
                    (wc >= hardCeiling) ||
                    isLastWord;

                if (shouldBreak) {
                    const group = filtered.slice(chunkStart, i + 1);
                    let text = group.map((w) => w.word).join(' ');
                    text = text.replace(/\b(Sincerely,)\s+/i, '$1\n');
                    text = text.replace(/^(Dear\s+[^,]+,)\s+/i, '$1\n');
                    chunks.push({
                        text,
                        start: group[0].start,
                        end: group[group.length - 1].end,
                    });
                    chunkStart = i + 1;
                }
            }
            return chunks;
        })();

        // Calculate which subtitle line to show based on audio progress
        const getCurrentSubtitle = () => {
            // When not playing, show the first chunk as a readable preview
            if (audioPhase === 'idle' && !isPlaying) {
                if (timestampChunks && timestampChunks.length > 0) {
                    return { current: timestampChunks[0].text, next: timestampChunks[1]?.text || '', lineIndex: 0, totalLines: timestampChunks.length };
                }
                if (allChunks.length > 0) {
                    return { current: allChunks[0], next: allChunks[1] || '', lineIndex: 0, totalLines: allChunks.length };
                }
                return null;
            }

            // ── Timestamp-based sync (precise) ──
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
                const cur = timestampChunks[chunkIndex]?.text || '';
                const nxt = timestampChunks[chunkIndex + 1]?.text || '';
                return { current: cur, next: nxt, lineIndex: chunkIndex, totalLines: timestampChunks.length };
            }

            // ── Fallback: word-count-weighted estimate (for older posts) ──
            const lines = audioPhase === 'response' ? responseChunks : letterChunks;
            if (lines.length === 0) return null;

            let phaseProgress: number;
            if (audioPhase === 'letter') {
                phaseProgress = computedLetterRatio > 0
                    ? Math.min(audioProgress / computedLetterRatio, 1)
                    : 0;
            } else {
                const responseRange = 1 - computedLetterRatio;
                phaseProgress = responseRange > 0
                    ? Math.min((audioProgress - computedLetterRatio) / responseRange, 1)
                    : 0;
            }

            const wordCounts = lines.map(l => l.split(/\s+/).length);
            const totalWords = wordCounts.reduce((a, b) => a + b, 0);
            let cumulative = 0;
            let lineIndex = 0;
            for (let i = 0; i < lines.length; i++) {
                cumulative += wordCounts[i] / totalWords;
                if (phaseProgress < cumulative) {
                    lineIndex = i;
                    break;
                }
                lineIndex = i;
            }

            const cur = lines[lineIndex] || '';
            const nxt = lines[lineIndex + 1] || '';
            const globalLineIndex = audioPhase === 'response' ? letterChunks.length + lineIndex : lineIndex;
            return { current: cur, next: nxt, lineIndex: globalLineIndex, totalLines: allChunks.length };
        };

        const subtitle = getCurrentSubtitle();

        return (
            <div ref={cardRef} className="bg-black border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-lg relative font-sans">
                {/* Short-form video container — 4:5 aspect ratio */}
                <div
                    className="relative w-full cursor-pointer overflow-hidden"
                    style={{ aspectRatio: '4 / 5' }}
                    onClick={toggleAudio}
                    title="Tap to pause/resume"
                >
                    {/* Hero image as full background */}
                    <img
                        src={heroUrl!}
                        alt={title || ""}
                        className="absolute inset-0 w-full h-full object-cover"
                    />

                    {/* Dark gradient overlays for text readability */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80" />

                    {/* Top: Author + Title */}
                    <div className="absolute top-0 left-0 right-0 p-4 z-10" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.7))' }}>
                        {/* Author row */}
                        <div className="flex items-center gap-2.5 mb-3">
                            <div className="w-9 h-9 rounded-full bg-zinc-800 border border-white/20 overflow-hidden flex items-center justify-center shrink-0">
                                {post.author_avatar_url ? (
                                    <img src={post.author_avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-4 h-4 text-zinc-400" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="text-sm font-semibold text-white/90 truncate block">
                                    {pseudonym}
                                </span>
                                {timestamp && (
                                    <span className="text-[10px] text-white/50">{timestamp}</span>
                                )}
                            </div>
                            {/* Mute toggle — always visible, matching feed style */}
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                                className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1 border border-white/10 transition-all duration-200 active:scale-95"
                            >
                                {isMuted ? (
                                    <VolumeX className="w-3.5 h-3.5 text-white/70" />
                                ) : (
                                    <Volume2 className="w-3.5 h-3.5 text-white animate-pulse" />
                                )}
                            </button>
                        </div>

                        {/* Title */}
                        {title && (
                            <h2 className="text-lg font-black text-white leading-tight drop-shadow-lg">
                                {title}
                            </h2>
                        )}
                    </div>

                    {/* Center: Subtitle text — matching FeedPostCard layout */}
                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none px-6">
                        <div className={`text-center max-w-[92%] transition-opacity duration-300 ${subtitle ? 'opacity-100' : 'opacity-0'}`}>
                            <p className="text-[1.35rem] sm:text-3xl lg:text-4xl font-bold text-white leading-tight" style={{ whiteSpace: 'pre-line', textShadow: '-1px -1px 0 rgba(0,0,0,0.85), 1px -1px 0 rgba(0,0,0,0.85), -1px 1px 0 rgba(0,0,0,0.85), 1px 1px 0 rgba(0,0,0,0.85), 0 2px 4px rgba(0,0,0,0.4)' }}>
                                {subtitle?.current || '\u00A0'}
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

                {/* Compact footer */}
                <div className="flex items-center px-4 py-2.5 bg-black/60 border-t border-white/5 gap-3">
                    <div className="flex items-center gap-4 flex-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); onInteract(); }}
                            className={cn(
                                "flex items-center gap-1.5 transition-all duration-200",
                                likes >= 1 ? "text-red-500" : "text-zinc-400 hover:text-white"
                            )}
                        >
                            <Heart className={cn("w-5 h-5", likes >= 1 && "fill-current")} />
                            {likes > 0 && (
                                <span className="text-xs font-medium">{likes}</span>
                            )}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onInteract(); }}
                            className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors"
                        >
                            <MessageCircle className="w-5 h-5" />
                            {commentCount > 0 && (
                                <span className="text-xs font-medium">{commentCount}</span>
                            )}
                        </button>
                        {/* Restart */}
                        {audioPhase !== 'idle' && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (audioRef.current) {
                                        audioRef.current.pause();
                                        audioRef.current = null;
                                    }
                                    setIsPlaying(false);
                                    setAudioPhase('idle');
                                    setAudioProgress(0);
                                    setTimeout(() => toggleAudio(), 50);
                                }}
                                className="text-zinc-400 hover:text-white transition-colors"
                                title="Restart"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ═══ TEXT-FORM FALLBACK (posts without audio) ═══
    return (
        <div className="bg-[#1a1a1a] border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative group font-sans">
            {/* Subtle top accent */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            {/* Header — same structure as FeedPostCard */}
            <div className="flex flex-row items-center gap-3 px-3 sm:px-4 py-3 sm:py-4 border-b border-white/5 bg-black/20 mb-2 w-full">
                <div className="shrink-0">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 overflow-hidden relative">
                        {post.author_avatar_url ? (
                            <img
                                src={post.author_avatar_url}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                        ) : null}
                        <User className={cn("w-5 h-5 text-zinc-400", post.author_avatar_url && "hidden")} />
                    </div>
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-semibold text-white truncate">{pseudonym}</span>
                    {timestamp && (
                        <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{timestamp}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="p-0 flex flex-col pt-4">
                {/* Image */}
                {post.imagen_url && (
                    <div className="px-3 sm:px-4 mb-2">
                        <div className="relative w-full aspect-[21/9] sm:aspect-video object-cover rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                            <img
                                src={post.imagen_url}
                                alt={title || "Post image"}
                                className="w-full h-full object-cover transition-all duration-500"
                            />
                        </div>
                    </div>
                )}

                {title && (
                    <div className="px-3 sm:px-4">
                        <h2 className="text-base sm:text-lg font-bold text-white mb-1 sm:mb-2 leading-tight">
                            {title}
                        </h2>
                    </div>
                )}

                {/* Letter & Response — same Q&A layout as FeedPostCard */}
                <div className={cn("px-3 sm:px-4 pb-3 sm:pb-4 mt-1", !isExpanded && "mb-2")}>
                    {/* Letter Block */}
                    {!isRealityShift && (
                        <div className="mb-4">
                            {greeting && (
                                <p className="text-sm sm:text-[15px] italic text-zinc-400 whitespace-pre-wrap leading-relaxed mb-1">
                                    {greeting}
                                </p>
                            )}
                            <p className={cn(
                                "text-sm sm:text-[15px] not-italic leading-relaxed text-zinc-300 whitespace-pre-wrap",
                                !isExpanded && "line-clamp-3"
                            )}>
                                {letterBody}
                            </p>
                        </div>
                    )}

                    {/* Reality Shift body */}
                    {isRealityShift && (
                        <p className={cn(
                            "text-sm sm:text-[15px] text-zinc-200 leading-relaxed whitespace-pre-wrap",
                            !isExpanded && "line-clamp-4"
                        )}>
                            {letterBody}
                        </p>
                    )}

                    {!isExpanded ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsExpanded(true); onExpandChange?.(true); }}
                            className="text-sm font-semibold text-zinc-400 hover:text-white mt-1 transition-colors duration-200"
                        >
                            Read more
                        </button>
                    ) : (
                        <>
                            {/* Response Block — the Ideal Self's advice */}
                            {!isRealityShift && rawResponse && (
                                <div className="text-zinc-100 not-italic text-sm sm:text-[15px] leading-relaxed [&_strong]:font-bold [&_strong]:text-white [&_em]:italic [&>p]:mb-4 [&>p:last-child]:mb-0">
                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                        {rawResponse.replace(/^THE COUNSEL:\s*/i, '')}
                                    </ReactMarkdown>
                                </div>
                            )}

                            <button
                                onClick={(e) => { e.stopPropagation(); setIsExpanded(false); onExpandChange?.(false); }}
                                className="text-sm font-semibold text-zinc-400 hover:text-white mt-3 transition-colors duration-200"
                            >
                                Show less
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Footer — like & comment counts, clicking scrolls to auth */}
            <div className="px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={(e) => { e.stopPropagation(); onInteract(); }}
                        className={cn("flex items-center gap-1 transition-transform active:scale-75 hover:scale-110",
                            likes >= 1 ? "text-red-500" : "text-zinc-500 hover:text-red-500/80"
                        )}
                    >
                        <Heart className={cn("w-5 h-5", likes >= 1 && "fill-red-500")} />
                        {likes > 1 && <span className="text-xs font-medium">{likes}</span>}
                    </button>

                    <button
                        onClick={(e) => { e.stopPropagation(); onInteract(); }}
                        className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors active:scale-75 hover:scale-110"
                    >
                        <MessageCircle className={cn("w-5 h-5", commentCount >= 1 && "fill-zinc-400")} />
                        {commentCount > 1 && <span className="text-xs font-medium">{commentCount}</span>}
                    </button>
                </div>
            </div>
        </div>
    );
}
