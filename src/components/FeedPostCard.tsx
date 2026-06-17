"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { User, Clock, Trash2, Lock, ChevronDown, ChevronUp, Heart, RefreshCw, RotateCcw, MessageCircle, ArrowUp, Play, Pause, Volume2, VolumeX, Share2, Download, Loader2, FileText, Copy, Check, ImagePlus } from "lucide-react";
import { useAudioMute, PAUSE_ALL_AUDIO_EVENT } from "@/context/AudioMuteContext";
import { cn } from "@/lib/utils";
import { getCountryFlag } from "@/lib/regionFlag";
import { formatDistanceToNow } from "date-fns";
import { Timestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';


interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface FeedPostProps {
    post: {
        id: string;
        uid: string;
        authorId?: string;
        type: 'checkin';
        post_type?: 'reality_shift';
        title?: string;
        pseudonym?: string;
        letter?: string;
        response?: string;
        tension?: string;
        counsel?: string;
        rant?: string;
        directive_title?: string;
        unexpected_yield?: string;
        conversation_messages?: ConversationMessage[];
        content_raw?: string;
        public_post?: {
            title?: string;
            pseudonym?: string;
            letter?: string;
            response?: string;
            imagen_url?: string;
        };
        imageUrl?: string;
        imagen_url?: string;
        sponsored_by?: string;
        sponsored_link?: string;
        region?: string;
        language?: string;
        created_at: Timestamp;
        is_public?: boolean;
        visibility?: 'private' | 'community' | 'public';
        isLikedByMe?: boolean;
        like_count?: number;
        author_avatar_url?: string;
        comments?: number;
        audio_url?: string;
        audio_letter_ratio?: number;
        audio_word_timestamps?: { word: string; start: number; end: number }[];
        letter_audio_url?: string;
        response_audio_url?: string;
        translations?: Record<string, any>;
        _translated?: Record<string, any>;
    };
    followingMap?: Record<string, string>;
    onFollowClick?: (authorId: string) => void;
    onRequestDelete?: (postId: string) => void;
}

export function FeedPostCard({ post, followingMap, onFollowClick, onRequestDelete }: FeedPostProps) {
    const [isResponseExpanded, setIsResponseExpanded] = useState(false);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [localVisibility, setLocalVisibility] = useState<'private' | 'community' | 'public'>(post.visibility || (post.is_public ? 'community' : 'private'));
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [videoToast, setVideoToast] = useState<string | null>(null);
    const [isTextView, setIsTextView] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
    const [regenToast, setRegenToast] = useState<string | null>(null);
    const [regenStyleOpen, setRegenStyleOpen] = useState(false);


    const t = useTranslations('feed');
    const locale = useLocale();

    // ═══ GLOBAL MUTE STATE ═══
    const { isMuted, toggleMute, pauseAll, isAutoPlaySuppressed } = useAudioMute();

    // ═══ AUDIO PLAYBACK STATE ═══
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioPhase, setAudioPhase] = useState<'idle' | 'letter' | 'response'>('idle');
    const [audioProgress, setAudioProgress] = useState(0);
    const cardRef = useRef<HTMLDivElement>(null);

    // Stable refs — prevent IntersectionObserver re-creation on every state change
    const isPlayingRef = useRef(false);
    const toggleAudioRef = useRef<() => void>(() => {});
    const isAutoPlaySuppressedRef = useRef(false);
    const hasCompletedRef = useRef(false);

    // Support both unified (audio_url) and legacy (letter_audio_url + response_audio_url) formats
    const unifiedAudioUrl = post.audio_url;
    const legacyHasAudio = Boolean(post.letter_audio_url && post.response_audio_url);
    const hasAudio = Boolean(unifiedAudioUrl) || legacyHasAudio;
    const heroUrl = post.public_post?.imagen_url || post.imagen_url;
    const canPlayShort = hasAudio && Boolean(heroUrl);

    // Share handler — Web Share API with clipboard fallback
    const [shareToast, setShareToast] = useState(false);
    const handleShare = useCallback(async () => {
        const url = `${window.location.origin}/post/${post.id}`;
        const text = post.public_post?.title || 'Check out this post on Earnest Page';
        try {
            if (navigator.share) {
                await navigator.share({ title: text, url });
            } else {
                await navigator.clipboard.writeText(url);
                setShareToast(true);
                setTimeout(() => setShareToast(false), 2000);
            }
        } catch { /* user cancelled share sheet */ }
    }, [post.id, post.public_post?.title]);

    // Compute letter word ratio for phase boundary estimation
    const letterText = post.public_post?.letter || post.letter || post.tension || '';
    const responseText = post.public_post?.response || post.response || post.counsel || '';
    const computedLetterRatio = (() => {
        if (post.audio_letter_ratio != null) return post.audio_letter_ratio;
        const lw = letterText.split(/\s+/).filter(Boolean).length;
        const rw = responseText.split(/\s+/).filter(Boolean).length;
        const total = lw + rw;
        return total > 0 ? lw / total : 0.5;
    })();

    // Audio toggle handler — supports both unified and legacy formats
    const toggleAudio = useCallback(() => {
        if (!hasAudio) return;

        // If already playing, pause
        if (isPlaying && audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
            return;
        }

        // Start from the beginning if idle
        if (audioPhase === 'idle' || !audioRef.current) {
            // Pause any other playing cards first
            pauseAll();
            if (unifiedAudioUrl) {
                // ── UNIFIED FORMAT: single audio file ──
                const audio = new Audio(unifiedAudioUrl);
                audio.muted = isMuted;
                audioRef.current = audio;
                setAudioPhase('letter');

                audio.ontimeupdate = () => {
                    if (audio.duration) {
                        const progress = audio.currentTime / audio.duration;
                        setAudioProgress(progress);
                        // Estimate phase from letter word ratio
                        const newPhase = progress < computedLetterRatio ? 'letter' : 'response';
                        setAudioPhase(prev => prev !== newPhase && prev !== 'idle' ? newPhase : prev);
                    }
                };

                audio.onended = () => {
                    setIsPlaying(false);
                    setAudioPhase('idle');
                    setAudioProgress(0);
                    audioRef.current = null;
                    hasCompletedRef.current = true;
                };

                audio.play().catch(() => setIsPlaying(false));
                setIsPlaying(true);
            } else if (post.letter_audio_url) {
                // ── LEGACY FORMAT: two separate audio files ──
                const audio = new Audio(post.letter_audio_url);
                audio.muted = isMuted;
                audioRef.current = audio;
                setAudioPhase('letter');

                audio.ontimeupdate = () => {
                    if (audio.duration) {
                        setAudioProgress(audio.currentTime / audio.duration);
                    }
                };

                audio.onended = () => {
                    if (post.response_audio_url) {
                        const responseAudio = new Audio(post.response_audio_url);
                        responseAudio.muted = isMuted;
                        audioRef.current = responseAudio;
                        setAudioPhase('response');
                        setAudioProgress(0);

                        responseAudio.ontimeupdate = () => {
                            if (responseAudio.duration) {
                                setAudioProgress(responseAudio.currentTime / responseAudio.duration);
                            }
                        };

                        responseAudio.onended = () => {
                            setIsPlaying(false);
                            setAudioPhase('idle');
                            setAudioProgress(0);
                            audioRef.current = null;
                            hasCompletedRef.current = true;
                        };

                        responseAudio.play().catch(() => setIsPlaying(false));
                    } else {
                        setIsPlaying(false);
                        setAudioPhase('idle');
                        setAudioProgress(0);
                        audioRef.current = null;
                        hasCompletedRef.current = true;
                    }
                };

                audio.play().catch(() => setIsPlaying(false));
                setIsPlaying(true);
            }
        } else {
            // Resume paused audio
            audioRef.current.play().catch(() => setIsPlaying(false));
            setIsPlaying(true);
        }
    }, [isPlaying, audioPhase, unifiedAudioUrl, post.letter_audio_url, post.response_audio_url, computedLetterRatio, isMuted, pauseAll]);

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
                    // Start playback (unless suppressed, already playing, or already completed)
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
                            setAudioPhase('idle');
                            setAudioProgress(0);
                        }
                        // Reset completion flag so re-scrolling to this card can auto-play again
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

    // Sync global mute state to active audio element
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.muted = isMuted;
        }
    }, [isMuted]);

    // Cleanup audio on unmount
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
            setAudioPhase('idle');
            setAudioProgress(0);
        };
        window.addEventListener(PAUSE_ALL_AUDIO_EVENT, handlePauseAll);
        return () => window.removeEventListener(PAUSE_ALL_AUDIO_EVENT, handlePauseAll);
    }, []);

    const [translatedData, setTranslatedData] = useState<any>(post._translated || post.translations?.[locale] || null);


    // Sync auto-translation when batch translate results arrive via prop change
    useEffect(() => {
        if (post._translated) {
            setTranslatedData(post._translated);
        }
    }, [post._translated]);

    const { user } = useAuth();

    // Comment state
    const [isCommentOpen, setIsCommentOpen] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [commentToast, setCommentToast] = useState<string | null>(null);
    const [comments, setComments] = useState<any[]>([]);
    const [commentsLoaded, setCommentsLoaded] = useState(false);

    const fetchComments = useCallback(async () => {
        if (!user || commentsLoaded) return;
        try {
            const idToken = await user.getIdToken();
            const res = await fetch(`/api/posts/comments?postId=${post.id}`, {
                headers: { 'Authorization': `Bearer ${idToken}` },
            });
            if (res.ok) {
                const data = await res.json();
                setComments(data.comments || []);
            }
            setCommentsLoaded(true);
        } catch (err) {
            console.error('Failed to fetch comments:', err);
        }
    }, [user, post.id, commentsLoaded]);

    const handleToggleComments = () => {
        const newState = !isCommentOpen;
        setIsCommentOpen(newState);
        if (newState && !commentsLoaded) fetchComments();
    };

    // Auto-load comments if the post has them
    useEffect(() => {
        if ((post.comments && post.comments > 0) && !commentsLoaded) {
            fetchComments();
        }
    }, [post.comments, commentsLoaded, fetchComments]);

    const submitComment = async () => {
        if (!user || !commentText.trim() || isSubmittingComment) return;
        setIsSubmittingComment(true);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/posts/comment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({ postId: post.id, comment: commentText.trim() }),
            });
            if (res.ok) {
                const data = await res.json();
                // Add the personal comment locally with avatar from API
                setComments(prev => [{
                    id: Date.now().toString(),
                    content: commentText.trim(),
                    type: 'personal',
                    is_mine: true,
                    author_title: t('roleYou'),
                    author_avatar_url: data.author_avatar_url || null,
                    created_at: null,
                }, ...prev]);
                setCommentText('');
                setCommentToast(t('commentSaved'));
                setTimeout(() => setCommentToast(null), 4000);
            }
        } catch (err) {
            console.error('Failed to submit comment:', err);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const postAuthorId = post.authorId || post.uid;
    const isAuthor = user?.uid === postAuthorId;
    const hasPrivateData = Boolean(
        (post.conversation_messages && post.conversation_messages.length > 0) ||
        post.content_raw ||
        (post.rant && post.counsel)
    );

    const [localLiked, setLocalLiked] = useState<boolean>(post.isLikedByMe || (isAuthor && (post.like_count || 0) > 0));

    useEffect(() => {
        setLocalLiked(post.isLikedByMe || (isAuthor && (post.like_count || 0) > 0));
    }, [post.isLikedByMe, isAuthor, post.like_count]);

    // Following resolution
    const isFollowing = postAuthorId && followingMap && followingMap[postAuthorId];
    const customAlias = isFollowing ? followingMap[postAuthorId] : null;

    // Comment count: prefer loaded comments array, fallback to post field
    const commentCount = comments.length > 0 ? comments.length : (post.comments || 0);

    // Total likes: karma pool likes + viewer's own like
    const totalLikes = (post.like_count || 0) + (localLiked ? 1 : 0);

    // Public face content
    const publicLetter = post.public_post?.letter || post.letter || post.tension;
    const publicResponse = post.public_post?.response || post.response || post.counsel;
    const publicPseudonym = post.public_post?.pseudonym || post.pseudonym || "Anonymous";
    const publicTitle = translatedData?.title || post.public_post?.title || post.title;

    const timeAgo = post.created_at ? formatDistanceToNow(post.created_at.toDate(), { addSuffix: true }) : t('justNow');

    const handleDelete = () => onRequestDelete?.(post.id);

    const handleVisibilityChange = async (value: 'private' | 'community' | 'public') => {
        if (!user || user.uid !== post.uid) return;
        const prev = localVisibility;
        setLocalVisibility(value);
        try {
            await updateDoc(doc(db, "posts", post.id), {
                visibility: value,
                is_public: value !== 'private',
            });
        } catch (error) {
            console.error("Error changing visibility:", error);
            setLocalVisibility(prev); // revert on failure
        }
    };

    const toggleLike = async () => {
        if (!user) return;
        setLocalLiked(true);
        try {
            const idToken = await user.getIdToken();
            await fetch('/api/posts/like', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({ postId: post.id }),
            });
        } catch (error) {
            console.error("Error sending karma like:", error);
        }
    };



    // Reality Shift posts (must check BEFORE the letter/response null guard)
    if (post.post_type === 'reality_shift') {
        const shiftTimeAgo = post.created_at ? formatDistanceToNow(post.created_at.toDate(), { addSuffix: true }) : t('justNow');
        const yieldText = translatedData?.unexpected_yield || post.unexpected_yield || '';
        const isLongYield = yieldText.length > 280;

        return (
            <div className="bg-[#1a1a1a] border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative font-sans">
                {/* Subtle top accent */}
                <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                {/* ═══ Header — matching regular feed cards ═══ */}
                <div className="flex flex-row items-center gap-3 px-3 sm:px-4 py-3 sm:py-4 border-b border-white/5 bg-black/20 w-full">
                    <div className="shrink-0">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 overflow-hidden">
                            {post.author_avatar_url ? (
                                <img src={post.author_avatar_url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : null}
                            <User className={`w-5 h-5 text-zinc-400 ${post.author_avatar_url ? 'hidden' : ''}`} style={post.author_avatar_url ? { position: 'absolute' } : undefined} />
                        </div>
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex flex-row items-center gap-2 w-full">
                            <span className="text-sm font-semibold text-white truncate">
                                {isAuthor ? t('authorMe') : customAlias || publicPseudonym || t('authorAnonymous')}
                            </span>
                            <div className="shrink-0 flex items-center gap-2">
                                {!isAuthor && !customAlias && postAuthorId && onFollowClick && (
                                    <button
                                        onClick={() => onFollowClick(postAuthorId)}
                                        className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded transition-all tracking-wide"
                                    >
                                        {t('followAuthor')}
                                    </button>
                                )}
                                {user?.uid === post.uid && (
                                    <select
                                        value={localVisibility}
                                        onChange={(e) => handleVisibilityChange(e.target.value as 'private' | 'community' | 'public')}
                                        className="text-[10px] font-bold tracking-wide bg-zinc-900 border border-zinc-700 text-zinc-400 rounded-md px-1.5 py-1 focus:outline-none focus:border-zinc-500 transition-all cursor-pointer appearance-none"
                                        style={{ backgroundImage: 'none' }}
                                    >
                                        <option value="private">🔒 Only Me</option>
                                        <option value="community">👥 Community</option>
                                        <option value="public">🌐 Public</option>
                                    </select>
                                )}
                            </div>
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{shiftTimeAgo}</span>
                            {(post.region || post.language) && (
                                <>
                                    <span className="text-zinc-700">·</span>
                                    <span>{getCountryFlag(post.region)} {post.language || ''}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* ═══ Body ═══ */}
                <div className="p-0 flex flex-col">
                    <div className="px-3 sm:px-4 pt-4 pb-3 sm:pb-4">
                        <h2 className="text-base sm:text-lg font-bold text-white mb-1 sm:mb-2 leading-tight">
                            {t('realityShiftTitle')}
                        </h2>

                        <p className={cn(
                            "text-sm sm:text-[15px] text-zinc-200 leading-relaxed whitespace-pre-wrap",
                            !isExpanded && isLongYield && "line-clamp-4"
                        )}>
                            {yieldText}
                        </p>

                        {isLongYield && (
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="text-sm font-semibold text-zinc-400 hover:text-white mt-2 transition-colors duration-200"
                            >
                                {isExpanded ? t('showLess') : t('readMore')}
                            </button>
                        )}
                    </div>
                </div>

                {/* ═══ Footer ═══ */}
                <div className="px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleLike}
                            className={cn("flex items-center gap-1 transition-transform active:scale-75 hover:scale-110",
                                totalLikes >= 1 ? "text-red-500" : "text-zinc-500 hover:text-red-500/80"
                            )}
                        >
                            <Heart className={cn("w-5 h-5", totalLikes >= 1 && "fill-red-500")} />
                            {totalLikes > 1 && <span className="text-xs font-medium">{totalLikes}</span>}
                        </button>

                    </div>
                    {user?.uid === post.uid && (
                        <button
                            onClick={handleDelete}
                            className="text-zinc-400 hover:text-red-500 transition-colors duration-200 p-1"
                            title={t('deletePost')}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // For non–reality-shift posts, letter and response are required
    if (!publicLetter || !publicResponse) {
        return null;
    }

    const isLongPrivateCounsel = (post.counsel || '').length > 400;
    const displayedPrivateCounsel = isLongPrivateCounsel && !isResponseExpanded
        ? post.counsel?.slice(0, 400) + "..."
        : post.counsel;

    // ═══ SHORT-FORM VIDEO MODE ═══
    // When a post has audio and a hero image, render as a vertical "short"
    if (canPlayShort) {
        // Split text into sentence-boundary chunks — each chunk is a complete thought.
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

        const letterChunks = chunkText(publicLetter || '');
        const responseChunks = chunkText((publicResponse || '').replace(/^THE COUNSEL:\s*/i, ''));

        // Build timestamp-based chunks at sentence boundaries if word timestamps are available
        const wordTimestamps = post.audio_word_timestamps;
        const timestampChunks: { text: string; start: number; end: number }[] | null = (() => {
            if (!wordTimestamps || wordTimestamps.length === 0) return null;

            // Filter out ellipsis tokens that leak from TTS separators
            const filtered = wordTimestamps.filter((w: any) => w.word !== '...' && w.word !== '…');
            if (filtered.length === 0) return null;

            // Determine letter/response boundary from word ratio
            const splitIndex = Math.round(filtered.length * computedLetterRatio);

            const chunks: { text: string; start: number; end: number }[] = [];
            const targetWords = 35;
            const hardCeiling = Math.ceil(targetWords * 1.5);
            let chunkStart = 0;

            for (let i = 0; i < filtered.length; i++) {
                const wordCount = i - chunkStart + 1;
                const word = filtered[i].word;
                const isSentenceEnd = /[.!?]/.test(word);
                const isNaturalPause = /[,;—–\-]/.test(word);
                const isLastWord = i === filtered.length - 1;
                // Force a break at the letter/response boundary
                const isLetterEnd = splitIndex > 0 && i === splitIndex - 1;

                const shouldBreak =
                    (isSentenceEnd && wordCount >= targetWords) ||
                    isLetterEnd ||
                    (isNaturalPause && wordCount >= hardCeiling) ||
                    (wordCount >= hardCeiling) ||
                    isLastWord;

                if (shouldBreak) {
                    const group = filtered.slice(chunkStart, i + 1);
                    let text = group.map((w: any) => w.word).join(' ');
                    // Format sign-off: "Sincerely, Name" → "Sincerely,\nName"
                    text = text.replace(/\b(Sincerely,)\s+/i, '$1\n');
                    // Format greeting: "Dear Name," → "Dear Name,\n"
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
                if (letterChunks.length > 0) {
                    return { current: letterChunks[0], next: letterChunks[1] || '', lineIndex: 0, totalLines: letterChunks.length };
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
                const current = timestampChunks[chunkIndex]?.text || '';
                const next = timestampChunks[chunkIndex + 1]?.text || '';
                return { current, next, lineIndex: chunkIndex, totalLines: timestampChunks.length };
            }

            // ── Fallback: word-count-weighted estimate (for older posts) ──
            const lines = audioPhase === 'response' ? responseChunks : letterChunks;
            if (lines.length === 0) return null;

            let phaseProgress: number;
            if (unifiedAudioUrl) {
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
            } else {
                phaseProgress = audioProgress;
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

            const current = lines[lineIndex] || '';
            const next = lines[lineIndex + 1] || '';
            return { current, next, lineIndex, totalLines: lines.length };
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
                        src={heroUrl}
                        alt={publicTitle || ""}
                        className="absolute inset-0 w-full h-full object-cover"
                    />



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
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-white/90 truncate">
                                        {isAuthor ? t('authorMe') : customAlias || publicPseudonym || t('authorAnonymous')}
                                    </span>
                                    {!isAuthor && !customAlias && postAuthorId && onFollowClick && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onFollowClick(postAuthorId); }}
                                            className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 px-2 py-0.5 rounded transition-all tracking-wide shrink-0"
                                        >
                                            {t('followAuthor')}
                                        </button>
                                    )}
                                </div>
                                <span className="text-[10px] text-white/50">{timeAgo}</span>
                            </div>
                            {/* Mute toggle — always visible, like Instagram Reels */}
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
                            {/* Visibility control */}
                            {user?.uid === post.uid && (
                                <select
                                    value={localVisibility}
                                    onChange={(e) => { e.stopPropagation(); handleVisibilityChange(e.target.value as 'private' | 'community' | 'public'); }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-[10px] font-bold tracking-wide bg-black/50 backdrop-blur-sm border border-white/20 text-white/70 rounded-md px-1.5 py-1 focus:outline-none transition-all cursor-pointer appearance-none"
                                    style={{ backgroundImage: 'none' }}
                                >
                                    <option value="private">🔒 Only Me</option>
                                    <option value="community">👥 Community</option>
                                    <option value="public">🌐 Public</option>
                                </select>
                            )}
                        </div>

                        {/* Title — hidden when verdict is baked into the image */}
                        {publicTitle && !(post as any).verdict && (
                            <h2 className="text-lg font-black text-white leading-tight drop-shadow-lg">
                                {publicTitle}
                            </h2>
                        )}
                    </div>



                    {/* Subtitle text — always rendered, visibility via opacity to avoid DOM pop-in */}
                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none px-6">
                        <div className={`text-center bg-black/45 backdrop-blur-[2px] rounded-2xl px-5 py-4 max-w-[92%] transition-opacity duration-300 ${subtitle ? 'opacity-100' : 'opacity-0'}`}>
                            <p className="text-[1.35rem] sm:text-3xl lg:text-4xl font-bold text-white leading-tight" style={{ whiteSpace: 'pre-line', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
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

                {/* Compact footer — likes | transcript toggle | delete + share */}
                <div className="flex items-center px-4 py-2.5 bg-black/60 border-t border-white/5 gap-3">
                    {/* Left: social actions */}
                    <div className="flex items-center gap-4 flex-1">
                        <button
                            onClick={toggleLike}
                            className={cn(
                                "flex items-center gap-1.5 transition-all duration-200",
                                localLiked ? "text-red-500" : "text-zinc-400 hover:text-white"
                            )}
                        >
                            <Heart className={cn("w-5 h-5", localLiked && "fill-current")} />
                            {totalLikes > 0 && (
                                <span className="text-xs font-medium">{totalLikes}</span>
                            )}
                        </button>
                        <button
                            onClick={() => setIsCommentOpen(!isCommentOpen)}
                            className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors"
                        >
                            <MessageCircle className="w-5 h-5" />
                            {post.comments && post.comments > 0 && (
                                <span className="text-xs font-medium">{post.comments}</span>
                            )}
                        </button>
                        {/* Restart — shown once audio has started */}
                        {audioPhase !== 'idle' && (
                            <button
                                onClick={() => {
                                    if (audioRef.current) {
                                        audioRef.current.pause();
                                        audioRef.current = null;
                                    }
                                    setIsPlaying(false);
                                    setAudioPhase('idle');
                                    setAudioProgress(0);
                                    // Small delay so state settles, then auto-play from start
                                    setTimeout(() => toggleAudio(), 50);
                                }}
                                className="text-zinc-400 hover:text-white transition-colors"
                                title="Restart"
                            >
                                <RotateCcw className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Center: view mode toggles */}
                    <div className="flex items-center gap-1.5">
                        {/* Text toggle — visible to all users */}
                        <button
                            onClick={() => { setIsTextView(!isTextView); if (!isTextView) setIsFlipped(false); }}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-200",
                                isTextView
                                    ? "bg-white/10 border-white/30 text-white"
                                    : "bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
                            )}
                        >
                            <FileText className="w-3.5 h-3.5" />
                            {isTextView ? 'Short' : 'Text'}
                        </button>

                        {/* Chat toggle — author only */}
                        {isAuthor && hasPrivateData && (
                            <button
                                onClick={() => { setIsFlipped(!isFlipped); if (!isFlipped) setIsTextView(false); setIsResponseExpanded(false); }}
                                className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-200",
                                    isFlipped
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                        : "bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
                                )}
                            >
                                <RefreshCw className={cn("w-3.5 h-3.5 transition-transform duration-500", isFlipped && "rotate-180")} />
                                {isFlipped ? 'Post' : 'Chat'}
                            </button>
                        )}
                    </div>

                    {/* Right: download + delete + share */}
                    <div className="flex items-center gap-2">
                        {/* MP4 Download — author only */}
                        {isAuthor && canPlayShort && (
                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    if (isGeneratingVideo || !user) return;
                                    setIsGeneratingVideo(true);
                                    setVideoToast(null);
                                    try {
                                        const idToken = await user.getIdToken();
                                        const res = await fetch(`/api/posts/${post.id}/video?refresh=1`, {
                                            headers: { Authorization: `Bearer ${idToken}` },
                                        });
                                        if (!res.ok) throw new Error('Failed to generate video');

                                        // API streams the MP4 bytes directly
                                        const blob = await res.blob();
                                        const blobUrl = URL.createObjectURL(blob);
                                        const filename = `earnest-page-${post.id}.mp4`;

                                        const isIOS = /iPhone|iPad/i.test(navigator.userAgent);
                                        let shared = false;

                                        // Try native share with file (iOS can save to camera roll)
                                        if (isIOS && navigator.share) {
                                            try {
                                                const file = new File([blob], filename, { type: 'video/mp4' });
                                                if (navigator.canShare?.({ files: [file] })) {
                                                    await navigator.share({ files: [file] });
                                                    shared = true;
                                                }
                                            } catch (shareErr: any) {
                                                // AbortError = user cancelled share sheet, still counts as handled
                                                if (shareErr?.name === 'AbortError') {
                                                    shared = true;
                                                } else {
                                                    console.warn('Native share failed, using fallback:', shareErr);
                                                }
                                            }
                                        }

                                        if (!shared) {
                                            if (isIOS) {
                                                // iOS ignores <a download> — open in new tab so user can long-press to save
                                                window.open(blobUrl, '_blank');
                                            } else {
                                                // Desktop / Android — programmatic download
                                                const a = document.createElement('a');
                                                a.href = blobUrl;
                                                a.download = filename;
                                                a.click();
                                            }
                                        }
                                        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                                        setVideoToast('Video ready!');
                                        setTimeout(() => setVideoToast(null), 3000);
                                    } catch (err) {
                                        console.error('Video download failed:', err);
                                        setVideoToast('Failed');
                                        setTimeout(() => setVideoToast(null), 3000);
                                    } finally {
                                        setIsGeneratingVideo(false);
                                    }
                                }}
                                className="text-zinc-400 hover:text-white transition-colors relative"
                                title="Download video"
                                disabled={isGeneratingVideo}
                            >
                                {isGeneratingVideo ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4" />
                                )}
                                {videoToast && (
                                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-zinc-800 text-white px-2 py-1 rounded whitespace-nowrap">{videoToast}</span>
                                )}
                            </button>
                        )}
                        {user?.uid === post.uid && (
                            <>
                                <div className="relative">
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!user || isRegeneratingImage) return;
                                            setIsRegeneratingImage(true);
                                            setRegenToast(null);
                                            try {
                                                const idToken = await user.getIdToken();
                                                const res = await fetch('/api/admin/regenerate-post', {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        'Authorization': `Bearer ${idToken}`,
                                                    },
                                                    body: JSON.stringify({ postId: post.id }),
                                                });
                                                if (res.ok) {
                                                    setRegenToast('✓ Regenerated');
                                                    setTimeout(() => window.location.reload(), 1500);
                                                } else {
                                                    const err = await res.json();
                                                    setRegenToast(err.error || 'Failed');
                                                }
                                            } catch (err) {
                                                setRegenToast('Failed');
                                            } finally {
                                                setIsRegeneratingImage(false);
                                                setTimeout(() => setRegenToast(null), 3000);
                                            }
                                        }}
                                        className={cn(
                                            "transition-colors relative",
                                            isRegeneratingImage ? "text-amber-400" : "text-zinc-400 hover:text-amber-400"
                                        )}
                                        title="Regenerate post (letter, response, audio, image)"
                                        disabled={isRegeneratingImage}
                                    >
                                        {isRegeneratingImage ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <ImagePlus className="w-4 h-4" />
                                        )}
                                    </button>
                                    {regenToast && (
                                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-zinc-800 text-white px-2 py-1 rounded whitespace-nowrap z-50">{regenToast}</span>
                                    )}
                                </div>
                                <button onClick={handleDelete} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </>
                        )}
                        <button
                            onClick={handleShare}
                            className="text-zinc-400 hover:text-white transition-colors relative"
                            title="Share"
                        >
                            <Share2 className="w-4 h-4" />
                            {shareToast && (
                                <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-zinc-800 text-white px-2 py-1 rounded whitespace-nowrap">Link copied</span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Text view — readable post content with copyable title */}
                {isTextView && (
                    <div className="border-t border-white/5 bg-zinc-950">
                        <div className="p-4 space-y-4">
                            {/* Title with copy button */}
                            {publicTitle && (
                                <div className="flex items-start gap-2">
                                    <h3 className="text-base font-bold text-white leading-tight flex-1">{publicTitle}</h3>
                                    <button
                                        onClick={async () => {
                                            await navigator.clipboard.writeText(publicTitle);
                                            setCopiedField('title');
                                            setTimeout(() => setCopiedField(null), 2000);
                                        }}
                                        className="shrink-0 p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/10 transition-all"
                                        title="Copy title"
                                    >
                                        {copiedField === 'title' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                </div>
                            )}

                            {/* Letter */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Letter</span>
                                    <button
                                        onClick={async () => {
                                            await navigator.clipboard.writeText(publicLetter || '');
                                            setCopiedField('letter');
                                            setTimeout(() => setCopiedField(null), 2000);
                                        }}
                                        className="p-1 rounded text-zinc-600 hover:text-white hover:bg-white/10 transition-all"
                                        title="Copy letter"
                                    >
                                        {copiedField === 'letter' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                </div>
                                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{publicLetter}</p>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-white/5" />

                            {/* Response */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Response</span>
                                    <button
                                        onClick={async () => {
                                            await navigator.clipboard.writeText(publicResponse || '');
                                            setCopiedField('response');
                                            setTimeout(() => setCopiedField(null), 2000);
                                        }}
                                        className="p-1 rounded text-zinc-600 hover:text-white hover:bg-white/10 transition-all"
                                        title="Copy response"
                                    >
                                        {copiedField === 'response' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                </div>
                                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{publicResponse}</p>
                            </div>

                            {/* Copy all as caption */}
                            <button
                                onClick={async () => {
                                    const caption = `${publicTitle || ''}\n\n${publicLetter || ''}\n\n${publicResponse || ''}`;
                                    await navigator.clipboard.writeText(caption.trim());
                                    setCopiedField('all');
                                    setTimeout(() => setCopiedField(null), 2000);
                                }}
                                className={cn(
                                    "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-semibold transition-all duration-200",
                                    copiedField === 'all'
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                        : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
                                )}
                            >
                                {copiedField === 'all' ? (
                                    <><Check className="w-3.5 h-3.5" /> Copied!</>
                                ) : (
                                    <><Copy className="w-3.5 h-3.5" /> Copy Full Caption</>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Comment section (reused) */}
                {isCommentOpen && (
                    <div className="px-3 sm:px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                        {commentToast && (
                            <div className="text-xs text-zinc-300 bg-zinc-800/60 border border-zinc-700/40 rounded-lg px-3 py-2">
                                {commentToast}
                            </div>
                        )}
                        <div className="relative bg-zinc-900/50 border border-zinc-800 rounded-full flex items-center px-4 py-2">
                            <input
                                type="text"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                                placeholder={t('commentPlaceholder')}
                                className="bg-transparent border-none focus:ring-0 focus:outline-none text-white placeholder-zinc-500 w-full pr-10 text-sm"
                                disabled={isSubmittingComment}
                            />
                            <button
                                onClick={submitComment}
                                disabled={!commentText.trim() || isSubmittingComment}
                                className={cn(
                                    "absolute right-3 transition-all duration-200",
                                    commentText.trim()
                                        ? "text-white cursor-pointer hover:scale-105"
                                        : "text-zinc-600 cursor-default"
                                )}
                            >
                                <ArrowUp className="w-5 h-5" />
                            </button>
                        </div>
                        {comments.length > 0 && (
                            <div className="space-y-3 pt-1">
                                {comments.map((c: any) => (
                                    <div key={c.id} className="flex items-start gap-2.5">
                                        <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 mt-0.5">
                                            {c.author_avatar_url ? (
                                                <img src={c.author_avatar_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <User className="w-3.5 h-3.5 text-zinc-500" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-xs font-semibold text-zinc-400">
                                                {c.is_mine ? t('roleYou') : c.author_title}
                                            </span>
                                            <p className="text-sm text-zinc-300 leading-relaxed mt-0.5">{c.content}</p>
                                        </div>
                                        {c.is_mine && (
                                            <button
                                                onClick={async () => {
                                                    if (!user) return;
                                                    setComments(prev => prev.filter(x => x.id !== c.id));
                                                    try {
                                                        const idToken = await user.getIdToken();
                                                        await fetch('/api/posts/comment/delete', {
                                                            method: 'POST',
                                                            headers: {
                                                                'Content-Type': 'application/json',
                                                                'Authorization': `Bearer ${idToken}`,
                                                            },
                                                            body: JSON.stringify({ postId: post.id, commentId: c.id }),
                                                        });
                                                    } catch (err) {
                                                        console.error('Failed to delete comment:', err);
                                                    }
                                                }}
                                                className="shrink-0 p-1 text-zinc-600 hover:text-red-500 transition-colors mt-0.5"
                                                title={t('deleteComment')}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Original chat transcript — shown when author taps the Chat button */}
                {isAuthor && hasPrivateData && isFlipped && (() => {
                    // Parse content_raw (old format) into chat bubble array
                    const parseRaw = (raw: string) => {
                        const parts = raw.split(/(?=\b(?:user|assistant):\s)/i).filter(Boolean);
                        return parts.map(part => {
                            const match = part.match(/^(user|assistant):\s*([\s\S]*)/i);
                            if (!match) return null;
                            return { role: match[1].toLowerCase(), content: match[2].trim() };
                        }).filter(Boolean);
                    };

                    const messages = post.conversation_messages && post.conversation_messages.length > 0
                        ? post.conversation_messages
                        : post.content_raw ? parseRaw(post.content_raw) : [];

                    return (
                        <div className="border-t border-white/5 bg-zinc-950">
                            <div className="p-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <Lock className="w-3.5 h-3.5 text-emerald-500" />
                                    <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Original Chat</h3>
                                </div>
                                <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                                    {messages.length > 0 ? messages.map((msg: any, idx: number) => (
                                        <div key={idx} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                                            <div className={cn(
                                                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                                                msg.role === 'user'
                                                    ? "bg-zinc-800 text-zinc-200 rounded-br-sm"
                                                    : "bg-zinc-900/80 text-zinc-300 rounded-bl-sm border border-zinc-800"
                                            )}>
                                                {msg.content}
                                            </div>
                                        </div>
                                    )) : (
                                        // Final fallback — rant/counsel format
                                        <div className="space-y-4">
                                            {post.rant && <p className="text-sm text-zinc-300 leading-relaxed">{post.rant}</p>}
                                            {post.counsel && (
                                                <>
                                                    <div className="border-t border-zinc-800" />
                                                    <p className="text-sm text-zinc-400 leading-relaxed">{post.counsel}</p>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>
        );
    }

    return (
        <div ref={cardRef} className="bg-[#1a1a1a] border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative group font-sans">
            {/* Header */}
            <div className="flex flex-row items-center gap-3 px-3 sm:px-4 py-3 sm:py-4 border-b border-white/5 bg-black/20 mb-2 w-full">
                <div className="shrink-0">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 overflow-hidden relative">
                        {post.author_avatar_url ? (
                            <img src={post.author_avatar_url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : null}
                        <User className={`w-5 h-5 text-zinc-400 ${post.author_avatar_url ? 'hidden' : ''}`} style={post.author_avatar_url ? { position: 'absolute' } : undefined} />
                    </div>
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex flex-row items-center gap-2 w-full">
                        <span className="text-sm font-semibold text-white truncate">
                            {isAuthor ? t('authorMe') : customAlias || publicPseudonym || t('authorAnonymous')}
                        </span>
                        <div className="shrink-0 flex items-center gap-2">
                            {!isAuthor && !customAlias && postAuthorId && onFollowClick && (
                                <button
                                    onClick={() => onFollowClick(postAuthorId)}
                                    className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded transition-all tracking-wide"
                                >
                                    {t('followAuthor')}
                                </button>
                            )}
                            {user?.uid === post.uid && (
                                    <select
                                        value={localVisibility}
                                        onChange={(e) => handleVisibilityChange(e.target.value as 'private' | 'community' | 'public')}
                                        className="text-[10px] font-bold tracking-wide bg-zinc-900 border border-zinc-700 text-zinc-400 rounded-md px-1.5 py-1 focus:outline-none focus:border-zinc-500 transition-all cursor-pointer appearance-none"
                                        style={{ backgroundImage: 'none' }}
                                    >
                                        <option value="private">🔒 Only Me</option>
                                        <option value="community">👥 Community</option>
                                        <option value="public">🌐 Public</option>
                                    </select>
                                )}
                        </div>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{timeAgo}</span>
                        {(post.region || post.language) && (
                            <>
                                <span className="text-zinc-700">·</span>
                                <span>{getCountryFlag(post.region)} {post.language || ''}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="p-0 flex flex-col pt-4">
                {/* 3D Perspective Container */}
                <div className="relative w-full [perspective:1000px] mb-4">
                    <div className={cn(
                        "relative w-full transition-transform duration-700 [transform-style:preserve-3d]",
                        isFlipped && "[transform:rotateY(180deg)]"
                    )}>

                        {/* --- FRONT FACE (Public Post) --- */}
                        <div className={cn(
                            "w-full top-0 left-0 [backface-visibility:hidden] transition-opacity duration-300",
                            isFlipped ? "absolute opacity-0 pointer-events-none" : "relative opacity-100"
                        )}>
                            {/* AI Generated Image */}
                            {(() => {
                                const displayUrl = post.public_post?.imagen_url || post.imagen_url;

                                if (!displayUrl) return null;

                                return (
                                    <div className="px-3 sm:px-4 mb-2">
                                <div className="relative w-full aspect-[21/9] sm:aspect-video object-cover rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                                            <img
                                                src={displayUrl}
                                                alt={publicTitle || "Hero Object"}
                                                className="w-full h-full object-cover transition-all duration-500"
                                            />
                                            {/* Audio play/pause overlay */}
                                            {hasAudio && (
                                                <>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); toggleAudio(); }}
                                                        className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-all duration-300 group/play"
                                                        aria-label={isPlaying ? 'Pause' : 'Play'}
                                                    >
                                                        <div className={cn(
                                                            "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300",
                                                            isPlaying
                                                                ? "bg-black/60 backdrop-blur-sm border border-white/20 opacity-0 group-hover/play:opacity-100"
                                                                : "bg-black/60 backdrop-blur-sm border border-white/20"
                                                        )}>
                                                            {isPlaying
                                                                ? <Pause className="w-6 h-6 text-white" />
                                                                : <Play className="w-6 h-6 text-white ml-0.5" />
                                                            }
                                                        </div>
                                                    </button>
                                                    {/* Audio progress bar */}
                                                    {isPlaying && (
                                                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                                                            <div
                                                                className="h-full bg-white/80 transition-all duration-200"
                                                                style={{ width: `${audioProgress * 100}%` }}
                                                            />
                                                        </div>
                                                    )}
                                                    {/* Phase indicator */}
                                                    {isPlaying && (
                                                        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1 border border-white/10">
                                                            <Volume2 className="w-3 h-3 text-white animate-pulse" />
                                                            <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                                                                {audioPhase === 'letter' ? 'Letter' : 'Response'}
                                                            </span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        {post.sponsored_by && (
                                            <a
                                                href={post.sponsored_link || '#'}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block text-[10px] text-zinc-500 uppercase tracking-widest mt-1.5 hover:text-zinc-400 transition-colors"
                                            >
                                                Sponsored by {post.sponsored_by}
                                            </a>
                                        )}
                                    </div>
                                );
                            })()}

                            {publicTitle && (
                                <div className="px-3 sm:px-4">
                                    <h2 className="text-base sm:text-lg font-bold text-white mb-1 sm:mb-2 leading-tight">
                                        {publicTitle}
                                    </h2>
                                </div>
                            )}

                            {post.imageUrl && (
                                <div className="px-3 sm:px-4 mb-2">
                                    <div className="relative w-full aspect-[21/9] sm:aspect-video object-cover rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                                        <Image
                                            src={post.imageUrl}
                                            alt={publicTitle || "Post Image"}
                                            fill
                                            className={cn(
                                                "object-cover transition-all duration-500",
                                                !isAuthor ? "blur-3xl scale-110 opacity-80" : ""
                                            )}
                                        />
                                        {!isAuthor && (
                                            <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-md rounded-full p-1.5 shadow-lg border border-white/10 z-10" title="Image obscured for privacy">
                                                <Lock className="w-3.5 h-3.5 text-zinc-400" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Public Letter & Response — Q&A Layout */}
                            <div className={cn("px-3 sm:px-4 pb-3 sm:pb-4 mt-1", !isExpanded && "mb-2")}>
                                {/* Letter Block (The User's Tension) */}
                                {(() => {
                                    const sourceLetter = translatedData?.letter || publicLetter || '';
                                    const lines = sourceLetter.split('\n');
                                    const firstLine = lines[0]?.trim() || '';
                                    const hasGreeting = /^dear\s/i.test(firstLine);
                                    const greeting = hasGreeting ? firstLine : null;
                                    const body = hasGreeting ? lines.slice(1).join('\n').trimStart() : publicLetter;
                                    return (
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
                                                {body}
                                            </p>
                                        </div>
                                    );
                                })()}

                                {!isExpanded ? (
                                    <button
                                        onClick={() => setIsExpanded(true)}
                                        className="text-sm font-semibold text-zinc-400 hover:text-white mt-1 transition-colors duration-200"
                                    >
                                        {t('readMore')}
                                    </button>
                                ) : (
                                    <>



                                        {/* Response Block (The Ideal Self's Advice) */}
                                        <div className="text-zinc-100 not-italic text-sm sm:text-[15px] leading-relaxed [&_strong]:font-bold [&_strong]:text-white [&_em]:italic [&>p]:mb-4 [&>p:last-child]:mb-0">
                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{(translatedData?.response || publicResponse || '').replace(/^THE COUNSEL:\s*/i, '')}</ReactMarkdown>
                                        </div>

                                        <button
                                            onClick={() => setIsExpanded(false)}
                                            className="text-sm font-semibold text-zinc-400 hover:text-white mt-3 transition-colors duration-200"
                                        >
                                            {t('showLess')}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* --- BACK FACE (Private Vault — Conversation Transcript) --- */}
                        {isAuthor && hasPrivateData && (
                            <div className={cn(
                                "w-full top-0 left-0 [backface-visibility:hidden] [transform:rotateY(180deg)] transition-opacity duration-300 px-3 sm:px-4",
                                !isFlipped ? "absolute opacity-0 pointer-events-none" : "relative opacity-100"
                            )}>
                                <div className="bg-zinc-950 border border-emerald-900/30 rounded-xl p-3 sm:p-5 shadow-inner">
                                    <div className="flex items-center gap-2 mb-4 border-b border-emerald-900/30 pb-3">
                                        <Lock className="w-4 h-4 text-emerald-500" />
                                        <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-widest">
                                            {post.conversation_messages ? t('rawConversation') : t('rawInputCounsel')}
                                        </h3>
                                    </div>

                                    {/* Conversation Transcript (new - array format) */}
                                    {post.conversation_messages && post.conversation_messages.length > 0 ? (
                                        <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                                            {post.conversation_messages.map((msg, idx) => (
                                                <div
                                                    key={idx}
                                                    className={cn(
                                                        "text-sm whitespace-pre-wrap leading-snug p-3 rounded-lg",
                                                        msg.role === 'user'
                                                            ? "bg-black/40 border border-white/5 text-zinc-400 italic"
                                                            : "bg-emerald-950/30 border border-emerald-900/20 text-zinc-200"
                                                    )}
                                                >
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 block mb-1">
                                                        {msg.role === 'user' ? t('roleYou') : t('roleCharacter')}
                                                    </span>
                                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                                        {msg.content}
                                                    </ReactMarkdown>
                                                </div>
                                            ))}
                                        </div>
                                    ) : post.content_raw ? (
                                        /* Conversation transcript (string format from cron) */
                                        <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                                            {post.content_raw.split('\n').filter(line => line.trim()).map((line, idx) => {
                                                const isUser = line.startsWith('user:');
                                                const content = line.replace(/^(user|assistant):\s*/i, '');
                                                return (
                                                    <div
                                                        key={idx}
                                                        className={cn(
                                                            "text-sm whitespace-pre-wrap leading-snug p-3 rounded-lg",
                                                            isUser
                                                                ? "bg-black/40 border border-white/5 text-zinc-400 italic"
                                                                : "bg-emerald-950/30 border border-emerald-900/20 text-zinc-200"
                                                        )}
                                                    >
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 block mb-1">
                                                            {isUser ? t('roleYou') : t('roleCharacter')}
                                                        </span>
                                                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                                            {content}
                                                        </ReactMarkdown>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <>
                                            {/* Legacy: Raw Rant + Counsel */}
                                            {post.rant && (
                                                <div className="mb-6">
                                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{t('rawInputTitle')}</h4>
                                                    <p className="text-sm italic text-zinc-400 whitespace-pre-wrap leading-snug p-3 bg-black/40 rounded-lg border border-white/5">
                                                        {post.rant}
                                                    </p>
                                                </div>
                                            )}
                                            {post.counsel && (
                                                <div>
                                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{t('rawCounselTitle')}</h4>
                                                    <div className="text-zinc-200 whitespace-pre-wrap text-sm sm:text-[15px] leading-snug [&_strong]:font-bold [&_strong]:text-white [&_em]:italic [&>p]:mb-3 [&>p:last-child]:mb-0">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{displayedPrivateCounsel || ""}</ReactMarkdown>
                                                    </div>
                                                    {isLongPrivateCounsel && (
                                                        <button
                                                            onClick={() => setIsResponseExpanded(!isResponseExpanded)}
                                                            className="mt-4 text-[10px] font-bold uppercase tracking-widest text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
                                                        >
                                                            {isResponseExpanded ? (
                                                                <>{t('showLess')} <ChevronUp className="w-3 h-3" /></>
                                                            ) : (
                                                                <>{t('readMore')} <ChevronDown className="w-3 h-3" /></>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                    </div>
                </div>

                {/* Bottom Action Bar */}
                <div className="px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleLike}
                            className={cn("flex items-center gap-1 transition-transform active:scale-75 hover:scale-110",
                                totalLikes >= 1 ? "text-red-500" : "text-zinc-500 hover:text-red-500/80"
                            )}
                            title={t('likeTooltip')}
                        >
                            <Heart className={cn("w-5 h-5", totalLikes >= 1 && "fill-red-500")} />
                            {totalLikes > 1 && (
                                <span className="text-xs font-medium">
                                    {totalLikes}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={handleToggleComments}
                            className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors active:scale-75 hover:scale-110"
                            title={t('commentTooltip')}
                        >
                            <MessageCircle className={cn("w-5 h-5", commentCount >= 1 && "fill-zinc-400")} />
                            {commentCount > 1 && (
                                <span className="text-xs font-medium">
                                    {commentCount}
                                </span>
                            )}
                        </button>

                        {/* Flip Toggle */}
                        {isAuthor && hasPrivateData && (
                            <button
                                onClick={() => {
                                    setIsFlipped(!isFlipped);
                                    setIsResponseExpanded(false);
                                }}
                                className={cn(
                                    "flex items-center gap-1.5 transition-colors duration-200 group ml-2",
                                    isFlipped ? "text-white" : "text-zinc-400 hover:text-white"
                                )}
                                title={isFlipped ? t('viewPublic') : t('viewPrivate')}
                            >
                                <RefreshCw className={cn("w-4 h-4 transition-transform duration-500", isFlipped && "rotate-180")} />
                                <span className="text-zinc-400 text-sm hidden sm:inline">{isFlipped ? t('viewPublic') : t('viewPrivate')}</span>
                            </button>
                        )}
                        

                    </div>

                    {user?.uid === post.uid && (
                        <button
                            onClick={handleDelete}
                            className="text-zinc-400 hover:text-white transition-colors duration-200 p-1"
                            title={t('deletePost')}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={handleShare}
                        className="text-zinc-400 hover:text-white transition-colors duration-200 p-1 ml-auto relative"
                        title="Share"
                    >
                        <Share2 className="w-4 h-4" />
                        {shareToast && (
                            <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-zinc-800 text-white px-2 py-1 rounded whitespace-nowrap">Link copied</span>
                        )}
                    </button>
                </div>

                {/* Comment section */}
                {isCommentOpen && (
                    <div className="px-3 sm:px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                        {/* Comment toast */}
                        {commentToast && (
                            <div className="text-xs text-zinc-300 bg-zinc-800/60 border border-zinc-700/40 rounded-lg px-3 py-2">
                                {commentToast}
                            </div>
                        )}

                        {/* Comment input */}
                        <div className="relative bg-zinc-900/50 border border-zinc-800 rounded-full flex items-center px-4 py-2">
                            <input
                                type="text"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                                placeholder={t('commentPlaceholder')}
                                className="bg-transparent border-none focus:ring-0 focus:outline-none text-white placeholder-zinc-500 w-full pr-10 text-sm"
                                disabled={isSubmittingComment}
                            />
                            <button
                                onClick={submitComment}
                                disabled={!commentText.trim() || isSubmittingComment}
                                className={cn(
                                    "absolute right-3 transition-all duration-200",
                                    commentText.trim()
                                        ? "text-white cursor-pointer hover:scale-105"
                                        : "text-zinc-600 cursor-default"
                                )}
                            >
                                <ArrowUp className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Comments list */}
                        {comments.length > 0 && (
                            <div className="space-y-3 pt-1">
                                {comments.map((c: any) => (
                                    <div key={c.id} className="flex items-start gap-2.5">
                                        <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 mt-0.5">
                                            {c.author_avatar_url ? (
                                                <img src={c.author_avatar_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <User className="w-3.5 h-3.5 text-zinc-500" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-xs font-semibold text-zinc-400">
                                                {c.is_mine ? t('roleYou') : c.author_title}
                                            </span>
                                            <p className="text-sm text-zinc-300 leading-relaxed mt-0.5">{c.content}</p>
                                        </div>
                                        {c.is_mine && (
                                            <button
                                                onClick={async () => {
                                                    if (!user) return;
                                                    setComments(prev => prev.filter(x => x.id !== c.id));
                                                    try {
                                                        const idToken = await user.getIdToken();
                                                        await fetch('/api/posts/comment/delete', {
                                                            method: 'POST',
                                                            headers: {
                                                                'Content-Type': 'application/json',
                                                                'Authorization': `Bearer ${idToken}`,
                                                            },
                                                            body: JSON.stringify({ postId: post.id, commentId: c.id }),
                                                        });
                                                    } catch (err) {
                                                        console.error('Failed to delete comment:', err);
                                                    }
                                                }}
                                                className="shrink-0 p-1 text-zinc-600 hover:text-red-500 transition-colors mt-0.5"
                                                title={t('deleteComment')}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>


        </div>
    );
}
