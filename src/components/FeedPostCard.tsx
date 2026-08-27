"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { User, Clock, Trash2, Lock, ChevronDown, ChevronUp, Heart, RefreshCw, RotateCcw, MessageCircle, ArrowUp, Play, Pause, Volume2, VolumeX, Share2, Download, Loader2, FileText, Copy, Check, ImagePlus, SkipBack, SkipForward, Maximize, Minimize } from "lucide-react";
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
import { getPostText } from '@/lib/getPostText';


interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface FeedPostProps {
    post: {
        id: string;
        uid?: string;
        authorId?: string;
        type: 'checkin';
        post_type?: 'reality_shift';

        pseudonym?: string;
        letter?: string;
        response?: string;
        tension?: string;
        counsel?: string;
        rant?: string;

        unexpected_yield?: string;
        conversation_messages?: ConversationMessage[];
        content_raw?: string;
        public_post?: {
            pseudonym?: string;
            letter?: string;
            response?: string;
            imagen_url?: string;
            condensed_transcript?: { role: 'user' | 'ideal_self'; text: string }[];
        };
        imageUrl?: string;
        imagen_url?: string;
        imagen_urls?: string[];
        message_images?: string[];
        image_prompts?: string[];
        image_style?: 'per-message';
        user_photo_url?: string;
        hero_source?: 'user' | 'imagen';
        thumbnail_url?: string;

        sponsored_by?: string;
        sponsored_link?: string;
        region?: string;
        language?: string;
        title?: string;
        created_at: Timestamp | { _seconds: number; _nanoseconds?: number } | null;
        is_public?: boolean;
        visibility?: 'private' | 'community' | 'public';
        isLikedByMe?: boolean;
        like_count?: number;
        author_avatar_url?: string;
        author_title?: string;
        comments?: number;
        audio_url?: string;
        audio_letter_ratio?: number;
        audio_word_timestamps?: { word: string; start: number; end: number }[];
        audio_message_boundaries?: { role: string; startIndex: number; endIndex: number; startTime: number; endTime: number }[];
        letter_audio_url?: string;
        response_audio_url?: string;
        // Q&A short format fields
        short_question?: string;
        short_answer?: string;
        short_audio_url?: string;
        short_audio_word_timestamps?: { word: string; start: number; end: number }[];
        short_audio_letter_ratio?: number;
        short_audio_question_duration?: number;
        short_audio_answer_duration?: number;
        short_video_url?: string;
        translations?: Record<string, any>;
        _translated?: Record<string, any>;
    };
    followingMap?: Record<string, string>;
    onFollowClick?: (authorId: string) => void;
    onRequestDelete?: (postId: string) => void;
    onAudioPlayingChange?: (isPlaying: boolean) => void;
    digestMode?: boolean;
}

export function FeedPostCard({ post, followingMap, onFollowClick, onRequestDelete, onAudioPlayingChange, digestMode }: FeedPostProps) {
    // Helper: convert created_at (Timestamp | plain object | null) to Date
    const createdAtDate = (() => {
        if (!post.created_at) return null;
        if ('toDate' in post.created_at && typeof post.created_at.toDate === 'function') {
            return post.created_at.toDate();
        }
        if ('_seconds' in post.created_at) {
            return new Date(post.created_at._seconds * 1000);
        }
        return null;
    })();
    const [isResponseExpanded, setIsResponseExpanded] = useState(false);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [localVisibility, setLocalVisibility] = useState<'private' | 'community' | 'public'>(post.visibility || (post.is_public ? 'community' : 'private'));

    const [isTextView, setIsTextView] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
    const [regenToast, setRegenToast] = useState<string | null>(null);
    const [regenStyleOpen, setRegenStyleOpen] = useState(false);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [videoToast, setVideoToast] = useState<string | null>(null);

    // Dev-only features (regenerate button) — hidden on production
    const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    const t = useTranslations('feed');
    const locale = useLocale();

    // ═══ GLOBAL MUTE STATE ═══
    const { isMuted, toggleMute, pauseAll, isAutoPlaySuppressed } = useAudioMute();

    // ═══ AUDIO PLAYBACK STATE ═══
    // audioRef holds either an HTMLAudioElement (legacy format) or a WebAudioPlayer (unified format)
    const audioRef = useRef<any>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const webAudioCtxRef = useRef<AudioContext | null>(null);
    const decodedBufferRef = useRef<AudioBuffer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioPhase, setAudioPhase] = useState<'idle' | 'letter' | 'response'>('idle');
    const [audioProgress, setAudioProgress] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [audioCurrentTime, setAudioCurrentTime] = useState(0);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);
    const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const seekingRef = useRef(false);
    const [isAudioLoading, setIsAudioLoading] = useState(false);


    // Stable refs — prevent IntersectionObserver re-creation on every state change
    const isPlayingRef = useRef(false);
    const toggleAudioRef = useRef<() => void>(() => {});
    const isAutoPlaySuppressedRef = useRef(false);
    const hasCompletedRef = useRef(false);

    const hasCondensedTranscript = Boolean(post.public_post?.condensed_transcript?.length);
    // For condensed transcript posts, use the conversation audio (audio_url) not the short Q&A clip
    const unifiedAudioUrl = hasCondensedTranscript
        ? (post.audio_url || post.short_audio_url)
        : (post.short_audio_url || post.audio_url);
    const legacyHasAudio = Boolean(post.letter_audio_url && post.response_audio_url);
    const hasAudio = Boolean(unifiedAudioUrl) || legacyHasAudio;

    // Posts without audio are still processing — don't render
    if (!hasAudio) return null;

    const heroUrl = post.thumbnail_url || post.user_photo_url || post.public_post?.imagen_url || post.imagen_url;

    // Multi-image array: user photo first (if exists), then AI images, fallback to single
    const isPerMessage = post.image_style === 'per-message' && post.message_images?.length;
    const imageUrls = (() => {
        if (isPerMessage) return post.message_images!;
        const aiImages = post.imagen_urls?.length ? post.imagen_urls : (post.imagen_url ? [post.imagen_url] : []);
        if (post.user_photo_url) return [post.user_photo_url, ...aiImages];
        return aiImages;
    })();

    // ═══ IMAGE INDEX: timer-based for legacy, message-boundary for per-message ═══
    const [carouselIndex, setCarouselIndex] = useState(0);

    // Legacy timer carousel for old posts
    useEffect(() => {
        if (isPerMessage || imageUrls.length <= 1 || !isPlaying) return;
        const timer = setInterval(() => {
            setCarouselIndex(prev => (prev + 1) % imageUrls.length);
        }, 10000);
        return () => clearInterval(timer);
    }, [imageUrls.length, isPlaying, isPerMessage]);

    // Per-message: derive image index from audio timestamp + message boundaries
    const messageImageIndex = (() => {
        if (!isPerMessage || !post.audio_message_boundaries?.length) return 0;
        const currentTime = audioCurrentTime;
        for (let i = post.audio_message_boundaries.length - 1; i >= 0; i--) {
            if (currentTime >= post.audio_message_boundaries[i].startTime) {
                return Math.min(i, imageUrls.length - 1);
            }
        }
        return 0;
    })();

    // Show YouTube-style landscape card when post has both audio AND images
    const canPlayShort = hasAudio && (Boolean(heroUrl) || imageUrls.length > 0);
    // Alias for clarity in render — controls only render when canPlayShort
    const hasPlaybackControls = canPlayShort;

    // Preload audio metadata so duration shows before play (YouTube-style: "0:00 / 2:34")
    useEffect(() => {
        if (!unifiedAudioUrl || audioDuration > 0) return;
        const probe = new Audio();
        probe.preload = 'metadata';
        probe.src = unifiedAudioUrl;
        probe.onloadedmetadata = () => {
            setAudioDuration(probe.duration);
            probe.src = ''; // release network connection
        };
        return () => { probe.src = ''; };
    }, [unifiedAudioUrl]);

    // Share handler — Web Share API with clipboard fallback
    const [shareToast, setShareToast] = useState(false);
    const handleShare = useCallback(async () => {
        const url = `${window.location.origin}/post/${post.id}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: 'Earnest Page', url });
            } else {
                await navigator.clipboard.writeText(url);
                setShareToast(true);
                setTimeout(() => setShareToast(false), 2000);
            }
        } catch { /* user cancelled share sheet */ }
    }, [post.id]);

    // Compute letter word ratio for phase boundary estimation
    const { letter: letterText, response: responseText } = getPostText(post);
    const computedLetterRatio = (() => {
        if (post.short_audio_letter_ratio != null) return post.short_audio_letter_ratio;
        if (post.audio_letter_ratio != null) return post.audio_letter_ratio;
        const lw = letterText.split(/\s+/).filter(Boolean).length;
        const rw = responseText.split(/\s+/).filter(Boolean).length;
        const total = lw + rw;
        return total > 0 ? lw / total : 0.5;
    })();

    // Audio toggle handler — supports both unified and legacy formats
    const toggleAudio = useCallback(async () => {
        if (!hasAudio || isAudioLoading) return;

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
                // Detect Safari/WebKit — its decodeAudioData truncates concatenated MP3s
                // to only the first stream. Use HTMLAudioElement on Safari instead.
                const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
                    (typeof window !== 'undefined' && 'webkitAudioContext' in window && !('chrome' in window));

                setIsAudioLoading(true);
                try {
                    if (isSafari) {
                        // ── SAFARI PATH: HTMLAudioElement streams concatenated MP3s correctly ──
                        const audio = new Audio(unifiedAudioUrl);
                        audio.muted = isMuted;
                        audio.preload = 'auto';

                        await new Promise<void>((resolve, reject) => {
                            audio.oncanplaythrough = () => resolve();
                            audio.onerror = () => reject(new Error('Audio load failed'));
                            audio.load();
                            // Timeout fallback — don't wait forever for canplaythrough
                            setTimeout(resolve, 3000);
                        });

                        const safariPlayer = {
                            get currentTime() { return audio.currentTime; },
                            set currentTime(t: number) { audio.currentTime = t; },
                            get duration() { return audio.duration || 0; },
                            get muted() { return audio.muted; },
                            set muted(v: boolean) { audio.muted = v; },
                            play() { return audio.play(); },
                            pause() { audio.pause(); },
                            addEventListener() {},
                            removeEventListener() {},
                        };

                        // Progress tracking via timeupdate
                        audio.ontimeupdate = () => {
                            if (!seekingRef.current && audio.duration) {
                                const progress = audio.currentTime / audio.duration;
                                setAudioProgress(progress);
                                setAudioCurrentTime(audio.currentTime);
                                const newPhase = progress < computedLetterRatio ? 'letter' : 'response';
                                setAudioPhase(prev => prev !== newPhase && prev !== 'idle' ? newPhase : prev);
                            }
                        };

                        audio.onended = () => {
                            setIsPlaying(false);
                            setAudioPhase('idle');
                            setAudioProgress(0);
                            setAudioCurrentTime(0);
                            audioRef.current = null;
                            hasCompletedRef.current = true;
                        };

                        audioRef.current = safariPlayer;
                        setAudioPhase('letter');
                        setAudioDuration(audio.duration || 0);

                        // Update duration once metadata loads (may not be available immediately)
                        audio.onloadedmetadata = () => {
                            if (audio.duration && isFinite(audio.duration)) {
                                setAudioDuration(audio.duration);
                            }
                        };

                        await safariPlayer.play();
                        setIsPlaying(true);
                    } else {
                        // ── CHROME/FIREFOX PATH: Web Audio API for reliable seeking ──
                        // Concatenated MP3s from TTS lack seek headers, so HTMLAudioElement can't seek.
                        // Web Audio API decodes to PCM AudioBuffer which supports perfect random access.

                        // Reuse cached decoded buffer if available
                        let audioBuffer = decodedBufferRef.current;
                        if (!audioBuffer) {
                            const response = await fetch(unifiedAudioUrl);
                            const arrayBuffer = await response.arrayBuffer();
                            const ctx = new AudioContext();
                            audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                            decodedBufferRef.current = audioBuffer;
                            await ctx.close(); // close temporary decode context
                        }

                        // Create playback context
                        const playCtx = new AudioContext();
                        webAudioCtxRef.current = playCtx;
                        const gainNode = playCtx.createGain();
                        gainNode.connect(playCtx.destination);
                        gainNode.gain.value = isMuted ? 0 : 1;

                        // WebAudioPlayer state
                        let wapSource: AudioBufferSourceNode | null = null;
                        let wapStartTime = 0;
                        let wapOffset = 0;
                        let wapPlaying = false;
                        let wapRafId = 0;

                        const wapTick = () => {
                            if (!wapPlaying) return;
                            const ct = wapOffset + (playCtx.currentTime - wapStartTime);
                            if (!seekingRef.current) {
                                const progress = ct / audioBuffer!.duration;
                                setAudioProgress(progress);
                                setAudioCurrentTime(ct);
                                const newPhase = progress < computedLetterRatio ? 'letter' : 'response';
                                setAudioPhase(prev => prev !== newPhase && prev !== 'idle' ? newPhase : prev);
                            }
                            wapRafId = requestAnimationFrame(wapTick);
                        };

                        const wapStop = () => {
                            wapPlaying = false;
                            cancelAnimationFrame(wapRafId);
                            if (wapSource) {
                                wapSource.onended = null; // Prevent stale onended from firing after seek
                                try { wapSource.stop(); } catch { /* already stopped */ }
                                wapSource = null;
                            }
                        };

                        const wapPlay = (fromOffset: number) => {
                            wapSource = playCtx.createBufferSource();
                            wapSource.buffer = audioBuffer!;
                            wapSource.connect(gainNode);
                            wapSource.onended = () => {
                                if (wapPlaying) {
                                    wapPlaying = false;
                                    cancelAnimationFrame(wapRafId);
                                    setIsPlaying(false);
                                    setAudioPhase('idle');
                                    setAudioProgress(0);
                                    setAudioCurrentTime(0);
                                    audioRef.current = null;
                                    hasCompletedRef.current = true;
                                }
                            };
                            wapOffset = Math.max(0, Math.min(fromOffset, audioBuffer!.duration));
                            wapStartTime = playCtx.currentTime;
                            wapSource.start(0, wapOffset);
                            wapPlaying = true;
                            wapTick();
                        };

                        // Expose player interface on audioRef so handleSeek/handleSkip/pause-all work
                        const player = {
                            get currentTime() {
                                if (wapPlaying) return wapOffset + (playCtx.currentTime - wapStartTime);
                                return wapOffset;
                            },
                            set currentTime(t: number) {
                                const wasPlaying = wapPlaying;
                                if (wasPlaying) wapStop();
                                wapOffset = Math.max(0, Math.min(t, audioBuffer!.duration));
                                if (wasPlaying) wapPlay(wapOffset);
                            },
                            get duration() { return audioBuffer!.duration; },
                            get muted() { return gainNode.gain.value === 0; },
                            set muted(v: boolean) { gainNode.gain.value = v ? 0 : 1; },
                            play() {
                                if (wapPlaying) return Promise.resolve();
                                if (playCtx.state === 'suspended') playCtx.resume();
                                wapPlay(wapOffset);
                                return Promise.resolve();
                            },
                            pause() {
                                if (!wapPlaying) return;
                                wapOffset += playCtx.currentTime - wapStartTime;
                                wapStop();
                            },
                            // No-op stubs for compatibility
                            addEventListener() {},
                            removeEventListener() {},
                        };

                        audioRef.current = player;
                        setAudioPhase('letter');
                        setAudioDuration(audioBuffer.duration);

                        await player.play();
                        setIsPlaying(true);
                    }
                } catch (err) {
                    console.error('Failed to load audio:', err);
                    setIsPlaying(false);
                } finally {
                    setIsAudioLoading(false);
                }
            } else if (post.letter_audio_url) {
                // ── LEGACY FORMAT: two separate audio files ──
                const audio = new Audio(post.letter_audio_url);
                audio.muted = isMuted;
                audioRef.current = audio;
                setAudioPhase('letter');

                audio.ontimeupdate = () => {
                    if (audio.duration && !seekingRef.current) {
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
                            if (responseAudio.duration && !seekingRef.current) {
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
    }, [isPlaying, audioPhase, unifiedAudioUrl, post.letter_audio_url, post.response_audio_url, computedLetterRatio, isMuted, pauseAll, isAudioLoading]);

    // ═══ YOUTUBE-STYLE PLAYBACK CONTROLS ═══

    // Seek to a specific time (scrubber drag)
    const handleSeek = useCallback((time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setAudioCurrentTime(time);
            if (audioRef.current.duration) {
                setAudioProgress(time / audioRef.current.duration);
            }
        }
    }, []);

    // Skip forward/back by N seconds
    const handleSkip = useCallback((delta: number) => {
        if (audioRef.current) {
            const newTime = Math.max(0, Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + delta));
            audioRef.current.currentTime = newTime;
            setAudioCurrentTime(newTime);
            if (audioRef.current.duration) {
                setAudioProgress(newTime / audioRef.current.duration);
            }
        }
    }, []);

    // Auto-hide controls after 3 seconds of inactivity while playing
    const showControls = useCallback(() => {
        setControlsVisible(true);
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        if (isPlaying) {
            controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
        }
    }, [isPlaying]);

    // Show controls when not playing, auto-hide when playing
    useEffect(() => {
        if (!isPlaying) {
            setControlsVisible(true);
            if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        } else {
            controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
        }
        return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
    }, [isPlaying]);

    // Fullscreen toggle
    const toggleFullscreen = useCallback(() => {
        if (!cardRef.current) return;
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        } else {
            cardRef.current.requestFullscreen().catch(() => {});
        }
    }, []);

    // Sync fullscreen state
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // Format time as M:SS
    const formatTime = (seconds: number) => {
        if (!seconds || !isFinite(seconds)) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // Sync global mute state to active audio/video element
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.muted = isMuted;
        }
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
        }
    }, [isMuted]);

    // Cleanup audio + Web Audio context on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            if (webAudioCtxRef.current) {
                webAudioCtxRef.current.close().catch(() => {});
                webAudioCtxRef.current = null;
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
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.currentTime = 0;
            }
            setIsPlaying(false);
            setAudioPhase('idle');
            setAudioProgress(0);
        };
        window.addEventListener(PAUSE_ALL_AUDIO_EVENT, handlePauseAll);
        return () => window.removeEventListener(PAUSE_ALL_AUDIO_EVENT, handlePauseAll);
    }, []);

    // Notify parent when audio playing state changes (e.g. for carousel pause)
    useEffect(() => {
        onAudioPlayingChange?.(isPlaying);
    }, [isPlaying, onAudioPlayingChange]);

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
        if (!user) {
            window.dispatchEvent(new CustomEvent('open-auth-modal'));
            return;
        }
        if (!commentText.trim() || isSubmittingComment) return;
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

    // Public face content — prefer Q&A short format when available
    const hasShortFormat = Boolean(post.short_question && post.short_answer);
    const { letter: _derivedLetter, response: _derivedResponse } = getPostText(post);
    const publicLetter = hasShortFormat ? post.short_question : _derivedLetter;
    const publicResponse = hasShortFormat ? post.short_answer : _derivedResponse;
    const publicPseudonym = post.author_title || post.public_post?.pseudonym || post.pseudonym || "Anonymous";

    const timeAgo = createdAtDate ? formatDistanceToNow(createdAtDate, { addSuffix: true }) : t('justNow');

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
        if (!user) {
            window.dispatchEvent(new CustomEvent('open-auth-modal'));
            return;
        }
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
        const shiftTimeAgo = createdAtDate ? formatDistanceToNow(createdAtDate, { addSuffix: true }) : t('justNow');
        const yieldText = translatedData?.unexpected_yield || post.unexpected_yield || '';
        const isLongYield = yieldText.length > 280;

        return (
            <div className="bg-[#1a1a1a] border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative font-sans">
                {/* Subtle top accent */}
                <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                {/* ═══ Header — matching regular feed cards ═══ */}
                <div className="flex flex-row items-center gap-3 px-3 sm:px-4 py-3 sm:py-4 border-b border-white/5 bg-black/20 w-full">
                    <div className="shrink-0">
                        <div 
                            className={`w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 overflow-hidden ${isAuthor ? 'cursor-pointer' : ''}`}
                            onClick={isAuthor ? () => window.dispatchEvent(new CustomEvent('open-identity-editor')) : undefined}
                        >
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
        const chunkText = (text: string, targetWords: number = 12): string[] => {
            // Strip both literal '\n' strings (AI JSON artifacts) and real newlines
            const cleaned = text.replace(/\\n/g, ' ').replace(/\n+/g, ' ').trim();
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
        const allChunks = [...letterChunks, ...responseChunks];

        // Build timestamp-based chunks at sentence boundaries if word timestamps are available
        const wordTimestamps = hasCondensedTranscript
            ? (post.audio_word_timestamps || post.short_audio_word_timestamps)
            : (post.short_audio_word_timestamps || post.audio_word_timestamps);
        const timestampChunks: { text: string; start: number; end: number; words: { word: string; start: number; end: number }[] }[] | null = (() => {
            if (!wordTimestamps || wordTimestamps.length === 0) return null;

            // Filter out ellipsis tokens that leak from TTS separators
            const filtered = wordTimestamps.filter((w: any) => w.word !== '...' && w.word !== '…');
            if (filtered.length === 0) return null;

            // Determine letter/response boundary from word ratio
            const splitIndex = Math.round(filtered.length * computedLetterRatio);

            const chunks: { text: string; start: number; end: number; words: { word: string; start: number; end: number }[] }[] = [];
            const minWords = 3;         // minimum before allowing a sentence-end break
            const targetWords = 7;      // target chunk size — short punchy karaoke phrases
            const hardCeiling = Math.ceil(targetWords * 1.5); // ~11 — force break regardless
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
                    (isSentenceEnd && wordCount >= minWords) ||
                    isLetterEnd ||
                    (isNaturalPause && wordCount >= targetWords) ||
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
                        words: group.map((w: any) => ({ word: w.word, start: w.start, end: w.end })),
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
                    // Timestamp chunks already include verdict words (prepended in TTS)
                    return { current: timestampChunks[0].text, next: timestampChunks[1]?.text || '', lineIndex: 0, totalLines: timestampChunks.length, words: timestampChunks[0].words, activeWordIndex: -1 };
                }
                if (allChunks.length > 0) {
                    return { current: allChunks[0], next: allChunks[1] || '', lineIndex: 0, totalLines: allChunks.length };
                }
                return null;
            }

            // ── Timestamp-based sync (precise) ──
            if (timestampChunks && audioRef.current) {
                const currentTime = audioCurrentTime;
                let chunkIndex = 0;
                for (let i = 0; i < timestampChunks.length; i++) {
                    if (currentTime >= timestampChunks[i].start) {
                        chunkIndex = i;
                    } else {
                        break;
                    }
                }
                const chunk = timestampChunks[chunkIndex];
                const current = chunk?.text || '';
                const next = timestampChunks[chunkIndex + 1]?.text || '';
                // Find active word within chunk for karaoke highlight
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
                return { current, next, lineIndex: chunkIndex, totalLines: timestampChunks.length, words: chunk?.words, activeWordIndex };
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
            // lineIndex in the context of allChunks (for image mapping)
            const globalLineIndex = (() => {
                if (audioPhase === 'response') return letterChunks.length + lineIndex;
                return lineIndex;
            })();
            return { current, next, lineIndex: globalLineIndex, totalLines: allChunks.length };
        };

        const subtitle = getCurrentSubtitle();

        // Image index driven by 5-second carousel timer (loops)
        const currentImageIndex = isPerMessage
            ? messageImageIndex
            : (imageUrls.length > 0 ? carouselIndex % imageUrls.length : 0);
        const currentImageUrl = imageUrls[currentImageIndex] || heroUrl;

        return (
            <div ref={cardRef} className="bg-black border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-lg relative font-sans">
                {/* Landscape video-style container — 16:9 aspect ratio (YouTube format) */}
                <div
                    className="relative w-full overflow-hidden aspect-video bg-black"
                    onClick={hasPlaybackControls ? (e) => { e.stopPropagation(); toggleAudio(); showControls(); } : undefined}
                    onMouseMove={hasPlaybackControls ? showControls : undefined}
                    onTouchStart={hasPlaybackControls ? showControls : undefined}
                    style={{ cursor: hasPlaybackControls ? 'pointer' : 'default' }}
                >
                    {/* Visual: B-roll image carousel with pillarboxing for portrait images */}
                    {/* Thumbnail poster — shown before playback starts */}
                    {post.thumbnail_url && !isPlaying && (
                        <img
                            src={post.thumbnail_url}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover z-[1] transition-opacity duration-500"
                            style={{ opacity: 1 }}
                        />
                    )}
                    {isPerMessage ? (
                        /* Per-message: only render current + next for lazy loading */
                        <>
                            {imageUrls[currentImageIndex] && (
                                <img
                                    key={`msg-${currentImageIndex}`}
                                    src={imageUrls[currentImageIndex]}
                                    alt=""
                                    className="absolute inset-0 w-full h-full object-contain transition-opacity duration-500"
                                    style={{ opacity: 1 }}
                                />
                            )}
                            {imageUrls[currentImageIndex + 1] && currentImageIndex + 1 < imageUrls.length && (
                                <img
                                    key={`msg-${currentImageIndex + 1}`}
                                    src={imageUrls[currentImageIndex + 1]}
                                    alt=""
                                    className="absolute inset-0 w-full h-full object-contain"
                                    style={{ opacity: 0 }}
                                />
                            )}
                        </>
                    ) : imageUrls.length > 1 ? (
                        <>
                            {imageUrls.map((url, i) => (
                                <img
                                    key={url}
                                    src={url}
                                    alt=""
                                    className="absolute inset-0 w-full h-full object-contain transition-opacity duration-700"
                                    style={{ opacity: i === currentImageIndex ? 1 : 0 }}
                                />
                            ))}
                        </>
                    ) : (
                        <img
                            src={currentImageUrl}
                            alt=""
                            className="absolute inset-0 w-full h-full object-contain"
                        />
                    )}

                    {/* Top: Author identity — always visible (not tied to playback controls) */}
                    <div className={`absolute top-0 left-0 right-0 z-10 ${isFullscreen ? 'p-6' : 'p-3 sm:p-4'}`} style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.7))' }}>
                        {/* Author row */}
                        <div className="flex items-center gap-2.5">
                            <div className={`rounded-full bg-zinc-800 border border-white/20 overflow-hidden flex items-center justify-center shrink-0 ${isFullscreen ? 'w-12 h-12' : 'w-8 h-8'}`}>
                                {post.author_avatar_url ? (
                                    <img src={post.author_avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <User className={`text-zinc-400 ${isFullscreen ? 'w-6 h-6' : 'w-4 h-4'}`} />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`font-semibold text-white/90 truncate ${isFullscreen ? 'text-lg' : 'text-sm'}`}>
                                        {isAuthor ? t('authorMe') : customAlias || publicPseudonym || t('authorAnonymous')}
                                    </span>
                                    {!isAuthor && !customAlias && postAuthorId && onFollowClick && !digestMode && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onFollowClick(postAuthorId); }}
                                            className={`font-bold text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 rounded transition-all tracking-wide shrink-0 ${isFullscreen ? 'text-sm px-3 py-1' : 'text-[10px] px-2 py-0.5'}`}
                                        >
                                            {t('followAuthor')}
                                        </button>
                                    )}
                                </div>
                                <span className={`text-white/50 ${isFullscreen ? 'text-sm' : 'text-[10px]'}`}>{timeAgo}</span>
                            </div>
                            {/* Visibility control */}
                            {user?.uid === post.uid && !digestMode && (
                                <select
                                    value={localVisibility}
                                    onChange={(e) => { e.stopPropagation(); handleVisibilityChange(e.target.value as 'private' | 'community' | 'public'); }}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`font-bold tracking-wide bg-black/50 backdrop-blur-sm border border-white/20 text-white/70 rounded-md focus:outline-none transition-all cursor-pointer appearance-none ${isFullscreen ? 'text-sm px-3 py-1.5' : 'text-[10px] px-1.5 py-1'}`}
                                    style={{ backgroundImage: 'none' }}
                                >
                                    <option value="private">🔒 Only Me</option>
                                    <option value="community">👥 Community</option>
                                    <option value="public">🌐 Public</option>
                                </select>
                            )}
                        </div>
                    </div>

                    {/* Large centered play button — visible when idle and audio available (YouTube thumbnail style) */}
                    {hasPlaybackControls && !isPlaying && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                            <div className={`rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20 transition-transform duration-200 hover:scale-110 ${isFullscreen ? 'w-24 h-24' : 'w-16 h-16 sm:w-20 sm:h-20'}`}>
                                {isAudioLoading ? (
                                    <Loader2 className={`text-white animate-spin ${isFullscreen ? 'w-12 h-12' : 'w-7 h-7 sm:w-9 sm:h-9'}`} />
                                ) : (
                                    <Play className={`text-white ml-1 ${isFullscreen ? 'w-12 h-12' : 'w-7 h-7 sm:w-9 sm:h-9'}`} fill="white" />
                                )}
                            </div>
                        </div>
                    )}

                    {/* Bold title overlay — lower-third on thumbnail, DigestCard-style outlined text, fades on play */}
                    {post.title && !isPlaying && !post.thumbnail_url && (
                        <div className={`absolute left-0 right-0 z-10 pointer-events-none ${isFullscreen ? 'bottom-24 px-10' : 'bottom-14 sm:bottom-16 px-4 sm:px-6'}`}>
                            {digestMode && (
                                <p className={`uppercase tracking-[0.2em] text-white/70 font-bold mb-1 ${isFullscreen ? 'text-sm' : 'text-[10px]'}`}>
                                    {t('digestLabel')}
                                </p>
                            )}
                            <h3 className={`font-black text-white leading-snug ${isFullscreen ? 'text-5xl sm:text-6xl lg:text-7xl' : 'text-2xl sm:text-4xl lg:text-5xl'}`} style={{ textShadow: '-2px -2px 0 rgba(0,0,0,0.9), 2px -2px 0 rgba(0,0,0,0.9), -2px 2px 0 rgba(0,0,0,0.9), 2px 2px 0 rgba(0,0,0,0.9), 0 3px 6px rgba(0,0,0,0.5)' }}>
                                {post.title}
                            </h3>
                        </div>
                    )}

                    {/* Subtitle text — lower-third style (above control bar) — only when audio is available */}
                    {hasPlaybackControls && isPlaying && (
                    <div className={`absolute left-0 right-0 z-10 pointer-events-none transition-all duration-300 ${isFullscreen ? (controlsVisible ? 'bottom-24' : 'bottom-8') + ' px-12' : (controlsVisible ? 'bottom-16 sm:bottom-[4.5rem]' : 'bottom-4 sm:bottom-6') + ' px-4 sm:px-8'}`}>
                        <div className={`text-center max-w-[90%] mx-auto transition-opacity duration-300 ${subtitle ? 'opacity-100' : 'opacity-0'}`}>
                            <p className={`font-bold text-white leading-snug ${isFullscreen ? 'text-3xl sm:text-4xl lg:text-5xl' : 'text-base sm:text-xl lg:text-2xl'}`} style={{ whiteSpace: 'pre-line', textShadow: isFullscreen ? '-2px -2px 0 rgba(0,0,0,0.9), 2px -2px 0 rgba(0,0,0,0.9), -2px 2px 0 rgba(0,0,0,0.9), 2px 2px 0 rgba(0,0,0,0.9), 0 3px 6px rgba(0,0,0,0.5)' : '-1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.5)' }}>
                                {subtitle?.words && subtitle.activeWordIndex !== undefined && subtitle.activeWordIndex >= 0 ? (
                                    subtitle.words.map((w: { word: string }, i: number) => (
                                        <span
                                            key={i}
                                            className={`transition-colors duration-100 ${i === subtitle.activeWordIndex ? 'text-amber-300' : 'text-white'}`}
                                        >
                                            {w.word}{i < subtitle.words.length - 1 ? ' ' : ''}
                                        </span>
                                    ))
                                ) : (
                                    subtitle?.current || '\u00A0'
                                )}
                            </p>
                        </div>
                    </div>
                    )}

                    {/* YouTube-style control bar — only when audio is available */}
                    {hasPlaybackControls && (
                    <div
                        className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                    >
                        {/* Gradient backdrop */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />

                        <div className={`relative ${isFullscreen ? 'px-6 pb-4 pt-8' : 'px-3 sm:px-4 pb-2 pt-6'}`}>
                            {/* Scrubber / progress bar */}
                            <div className="group flex items-center mb-1.5">
                                <input
                                    type="range"
                                    min={0}
                                    max={audioDuration || 100}
                                    step={0.1}
                                    value={audioCurrentTime}
                                    onChange={(e) => { e.stopPropagation(); handleSeek(parseFloat(e.target.value)); }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full h-1 group-hover:h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer transition-all duration-150 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:opacity-0 [&::-webkit-slider-thumb]:group-hover:opacity-100 [&::-webkit-slider-thumb]:transition-opacity"
                                    style={{
                                        background: `linear-gradient(to right, rgba(255,255,255,0.8) ${audioProgress * 100}%, rgba(255,255,255,0.2) ${audioProgress * 100}%)`
                                    }}
                                />
                            </div>

                            {/* Control buttons row */}
                            <div className="flex items-center gap-2 sm:gap-3">
                                {/* Play / Pause */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleAudio(); }}
                                    className="text-white hover:text-white/80 transition-colors p-1"
                                    title={isPlaying ? 'Pause' : 'Play'}
                                >
                                    {isPlaying ? <Pause className={isFullscreen ? 'w-7 h-7' : 'w-5 h-5'} fill="white" /> : <Play className={isFullscreen ? 'w-7 h-7' : 'w-5 h-5'} fill="white" />}
                                </button>

                                {/* Skip back 10s */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleSkip(-10); }}
                                    className="text-white/70 hover:text-white transition-colors p-1"
                                    title="Back 10 seconds"
                                >
                                    <SkipBack className={isFullscreen ? 'w-6 h-6' : 'w-4 h-4'} />
                                </button>

                                {/* Skip forward 10s */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleSkip(10); }}
                                    className="text-white/70 hover:text-white transition-colors p-1"
                                    title="Forward 10 seconds"
                                >
                                    <SkipForward className={isFullscreen ? 'w-6 h-6' : 'w-4 h-4'} />
                                </button>

                                {/* Time display */}
                                <span className={`text-white/60 font-mono tabular-nums ml-1 ${isFullscreen ? 'text-base' : 'text-xs'}`}>
                                    {formatTime(audioCurrentTime)} / {formatTime(audioDuration)}
                                </span>

                                {/* Spacer */}
                                <div className="flex-1" />

                                {/* Mute toggle */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                                    className="text-white/70 hover:text-white transition-colors p-1"
                                    title={isMuted ? 'Unmute' : 'Mute'}
                                >
                                    {isMuted ? <VolumeX className={isFullscreen ? 'w-6 h-6' : 'w-4 h-4'} /> : <Volume2 className={isFullscreen ? 'w-6 h-6' : 'w-4 h-4'} />}
                                </button>

                                {/* Fullscreen toggle */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                                    className="text-white/70 hover:text-white transition-colors p-1"
                                    title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                                >
                                    {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                    )}
                </div>



                {/* Compact footer — likes | transcript toggle | delete + share */}
                <div className="flex items-center px-4 py-2.5 bg-black/60 border-t border-zinc-700 gap-3">
                    {/* Left: social actions */}
                    <div className="flex items-center gap-4 flex-1">
                        {!digestMode && (
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
                        )}
                        {!digestMode && (
                            <button
                                onClick={() => setIsCommentOpen(!isCommentOpen)}
                                className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors"
                            >
                                <MessageCircle className="w-5 h-5" />
                                {post.comments && post.comments > 0 && (
                                    <span className="text-xs font-medium">{post.comments}</span>
                                )}
                            </button>
                        )}
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

                        {/* MP4 Video Download — author only */}
                        {isAuthor && canPlayShort && !digestMode && (
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

                                        const blob = await res.blob();
                                        const blobUrl = URL.createObjectURL(blob);
                                        const filename = `earnest-page-${post.id}.mp4`;

                                        const isIOS = /iPhone|iPad/i.test(navigator.userAgent);
                                        let shared = false;

                                        if (isIOS && navigator.share) {
                                            try {
                                                const file = new File([blob], filename, { type: 'video/mp4' });
                                                if (navigator.canShare?.({ files: [file] })) {
                                                    await navigator.share({ files: [file] });
                                                    shared = true;
                                                }
                                            } catch (shareErr: any) {
                                                if (shareErr?.name === 'AbortError') {
                                                    shared = true;
                                                } else {
                                                    console.warn('Native share failed, using fallback:', shareErr);
                                                }
                                            }
                                        }

                                        if (!shared) {
                                            if (isIOS) {
                                                window.open(blobUrl, '_blank');
                                            } else {
                                                const a = document.createElement('a');
                                                a.href = blobUrl;
                                                a.download = filename;
                                                a.click();
                                            }
                                        }
                                        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

                                        // Also download thumbnail for YouTube custom thumbnail
                                        const thumbUrl = post.thumbnail_url;
                                        if (thumbUrl) {
                                            try {
                                                const thumbRes = await fetch(thumbUrl);
                                                if (thumbRes.ok) {
                                                    const thumbBlob = await thumbRes.blob();
                                                    const thumbBlobUrl = URL.createObjectURL(thumbBlob);
                                                    const thumbFilename = `earnest-page-${post.id}-thumbnail.jpg`;
                                                    if (isIOS && navigator.share) {
                                                        try {
                                                            const thumbFile = new File([thumbBlob], thumbFilename, { type: 'image/jpeg' });
                                                            if (navigator.canShare?.({ files: [thumbFile] })) {
                                                                await navigator.share({ files: [thumbFile] });
                                                            }
                                                        } catch { /* user cancelled or unsupported */ }
                                                    } else {
                                                        const ta = document.createElement('a');
                                                        ta.href = thumbBlobUrl;
                                                        ta.download = thumbFilename;
                                                        ta.click();
                                                    }
                                                    setTimeout(() => URL.revokeObjectURL(thumbBlobUrl), 5000);
                                                }
                                            } catch (thumbErr) {
                                                console.warn('Thumbnail download failed:', thumbErr);
                                            }
                                        }

                                        setVideoToast('Video + thumbnail ready!');
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
                                title="Download video for YouTube"
                                disabled={isGeneratingVideo}
                            >
                                {isGeneratingVideo ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4" />
                                )}
                                {videoToast && (
                                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-zinc-800 text-white px-2 py-1 rounded whitespace-nowrap z-50">{videoToast}</span>
                                )}
                            </button>
                        )}

                        {isDev && user?.uid === post.uid && !digestMode && (
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
                        )}
                        {user?.uid === post.uid && !digestMode && (
                            <button onClick={handleDelete} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                        {!digestMode && (
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
                        )}
                    </div>
                </div>

                {/* Text view — readable post content */}
                {isTextView && (
                    <div className="border-t border-white/5 bg-zinc-950">
                        <div className="p-4 space-y-4">
                            {(() => {
                                const transcript = post.public_post?.condensed_transcript;
                                
                                if (transcript && transcript.length > 0) {
                                    // ── CONDENSED TRANSCRIPT TEXT VIEW ──
                                    return (
                                        <>
                                            {transcript.map((msg: { role: string; text: string }, idx: number) => (
                                                <div key={idx} className="space-y-1.5">
                                                    {idx > 0 && <div className="border-t border-white/5" />}
                                                    <div className="flex items-center justify-between pt-1">
                                                        <span className={cn(
                                                            "text-[10px] font-bold uppercase tracking-widest",
                                                            msg.role === 'user' ? 'text-zinc-500' : 'text-amber-500/70'
                                                        )}>
                                                            {msg.role === 'user'
                                                                ? (post.public_post?.pseudonym || publicPseudonym || 'You')
                                                                : '✦ Ideal Self'}
                                                        </span>
                                                        <button
                                                            onClick={async () => {
                                                                await navigator.clipboard.writeText(msg.text);
                                                                setCopiedField(`msg-${idx}`);
                                                                setTimeout(() => setCopiedField(null), 2000);
                                                            }}
                                                            className="p-1 rounded text-zinc-600 hover:text-white hover:bg-white/10 transition-all"
                                                            title="Copy message"
                                                        >
                                                            {copiedField === `msg-${idx}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                                </div>
                                            ))}
                                            
                                            {/* Copy all as caption */}
                                            <button
                                                onClick={async () => {
                                                    const caption = transcript
                                                        .map((m: { role: string; text: string }) =>
                                                            `${m.role === 'user' ? (post.public_post?.pseudonym || publicPseudonym || 'You') : '✦ Ideal Self'}:\n${m.text}`)
                                                        .join('\n\n');
                                                    await navigator.clipboard.writeText(caption);
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
                                                    <><Copy className="w-3.5 h-3.5" /> Copy Full Transcript</>
                                                )}
                                            </button>
                                        </>
                                    );
                                }
                                
                                // ── LEGACY LETTER/RESPONSE TEXT VIEW ──
                                return (
                                    <>
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
                                                const caption = `${publicLetter || ''}\n\n${publicResponse || ''}`;
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
                                    </>
                                );
                            })()}
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
                                                    if (!user) {
                                                        window.dispatchEvent(new CustomEvent('open-auth-modal'));
                                                        return;
                                                    }
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
                    <div 
                        className={`w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 overflow-hidden relative ${isAuthor ? 'cursor-pointer' : ''}`}
                        onClick={isAuthor ? () => window.dispatchEvent(new CustomEvent('open-identity-editor')) : undefined}
                    >
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
                            {!isAuthor && !customAlias && postAuthorId && onFollowClick && !digestMode && (
                                <button
                                    onClick={() => onFollowClick(postAuthorId)}
                                    className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded transition-all tracking-wide"
                                >
                                    {t('followAuthor')}
                                </button>
                            )}
                            {user?.uid === post.uid && !digestMode && (
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
                {post.title && !post.thumbnail_url && (
                    <div className="px-3 sm:px-4 mb-2">
                        {digestMode && (
                            <p className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-bold mb-1">
                                {t('digestLabel')}
                            </p>
                        )}
                        <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                            {post.title}
                        </h3>
                    </div>
                )}
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
                                                alt="Post image"
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



                            {post.imageUrl && (
                                <div className="px-3 sm:px-4 mb-2">
                                    <div className="relative w-full aspect-[21/9] sm:aspect-video object-cover rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                                        <Image
                                            src={post.imageUrl}
                                            alt="Post image"
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

                            {/* Post Content — Condensed Transcript or Legacy Letter/Response */}
                            <div className={cn("px-3 sm:px-4 pb-3 sm:pb-4 mt-1", !isExpanded && "mb-2")}>
                                {(() => {
                                    // Detect condensed transcript format
                                    const transcript = post.public_post?.condensed_transcript;
                                    
                                    if (transcript && transcript.length > 0) {
                                        // ── CONDENSED TRANSCRIPT VIEW ──
                                        const previewCount = 2; // Show first 2 messages before "Read More"
                                        const visibleMessages = isExpanded ? transcript : transcript.slice(0, previewCount);
                                        const bgImages = post.imagen_urls?.length ? post.imagen_urls : (post.imagen_url ? [post.imagen_url] : []);
                                        
                                        return (
                                            <>
                                                <div className="space-y-0">
                                                    {visibleMessages.map((msg: { role: string; text: string }, idx: number) => {
                                                        // Every 3 messages, show a rotating background image
                                                        const showImage = bgImages.length > 0 && idx > 0 && idx % 3 === 0;
                                                        const imgIndex = Math.floor(idx / 3) % bgImages.length;
                                                        
                                                        return (
                                                            <div key={idx}>
                                                                {/* Interspersed image */}
                                                                {showImage && isExpanded && (
                                                                    <div className="my-4 -mx-3 sm:-mx-4">
                                                                        <div className="relative w-full aspect-[21/9] overflow-hidden">
                                                                            <img
                                                                                src={bgImages[imgIndex]}
                                                                                alt=""
                                                                                className="w-full h-full object-cover"
                                                                            />
                                                                            <div className="absolute inset-0 bg-gradient-to-b from-[#1a1a1a] via-transparent to-[#1a1a1a] opacity-40" />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {/* Message bubble */}
                                                                <div className={cn(
                                                                    "py-3",
                                                                    idx > 0 && "border-t border-white/5"
                                                                )}>
                                                                    <div className="flex items-center gap-1.5 mb-1.5">
                                                                        <span className={cn(
                                                                            "text-[10px] font-bold uppercase tracking-widest",
                                                                            msg.role === 'user' ? 'text-zinc-500' : 'text-amber-500/70'
                                                                        )}>
                                                                            {msg.role === 'user' ? (post.public_post?.pseudonym || post.pseudonym || 'Anonymous') : '✦ Ideal Self'}
                                                                        </span>
                                                                    </div>
                                                                    <p className={cn(
                                                                        "text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap",
                                                                        msg.role === 'user'
                                                                            ? 'text-zinc-300'
                                                                            : 'text-zinc-100'
                                                                    )}>
                                                                        {msg.text}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                
                                                {!isExpanded && transcript.length > previewCount ? (
                                                    <button
                                                        onClick={() => setIsExpanded(true)}
                                                        className="text-sm font-semibold text-zinc-400 hover:text-white mt-1 transition-colors duration-200"
                                                    >
                                                        {t('readMore')} ({transcript.length - previewCount} more)
                                                    </button>
                                                ) : isExpanded ? (
                                                    <button
                                                        onClick={() => setIsExpanded(false)}
                                                        className="text-sm font-semibold text-zinc-400 hover:text-white mt-3 transition-colors duration-200"
                                                    >
                                                        {t('showLess')}
                                                    </button>
                                                ) : null}
                                            </>
                                        );
                                    }
                                    
                                    // ── LEGACY LETTER/RESPONSE VIEW ──
                                    const sourceLetter = translatedData?.letter || publicLetter || '';
                                    const lines = sourceLetter.split('\n');
                                    const firstLine = lines[0]?.trim() || '';
                                    const hasGreeting = /^dear\s/i.test(firstLine);
                                    const greeting = hasGreeting ? firstLine : null;
                                    const body = hasGreeting ? lines.slice(1).join('\n').trimStart() : publicLetter;
                                    return (
                                        <>
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

                                            {!isExpanded ? (
                                                <button
                                                    onClick={() => setIsExpanded(true)}
                                                    className="text-sm font-semibold text-zinc-400 hover:text-white mt-1 transition-colors duration-200"
                                                >
                                                    {t('readMore')}
                                                </button>
                                            ) : (
                                                <>
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
                                        </>
                                    );
                                })()}
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
                        {!digestMode && (
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
                        )}

                        {!digestMode && (
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
                        )}

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

                    {isDev && user?.uid === post.uid && !digestMode && (
                        <div className="flex items-center gap-1">
                            {/* Regenerate post */}
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
                                        "p-1 transition-colors duration-200",
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
                                    <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-zinc-800 text-white px-2 py-1 rounded whitespace-nowrap z-30">
                                        {regenToast}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    {user?.uid === post.uid && !digestMode && (
                        <button
                            onClick={handleDelete}
                            className="text-zinc-400 hover:text-white transition-colors duration-200 p-1"
                            title={t('deletePost')}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                    {!digestMode && (
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
                    )}
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
                                                    if (!user) {
                                                        window.dispatchEvent(new CustomEvent('open-auth-modal'));
                                                        return;
                                                    }
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
