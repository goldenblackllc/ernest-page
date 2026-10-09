"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAudioMute, PAUSE_ALL_AUDIO_EVENT } from "@/context/AudioMuteContext";

export type AudioPhase = 'idle' | 'letter' | 'response';

/**
 * The minimal player surface the card drives. Backed by an HTMLAudioElement
 * (legacy two-file format), a Safari wrapper around one, or a Web Audio player.
 */
interface FeedPlayer {
    currentTime: number;
    readonly duration: number;
    muted: boolean;
    play(): Promise<void>;
    pause(): void;
}

interface UseFeedAudioOptions {
    /** Single concatenated letter+response MP3 (unified format). */
    unifiedAudioUrl?: string;
    /** Legacy format: separate letter and response files. */
    letterAudioUrl?: string;
    responseAudioUrl?: string;
    /** Fraction of the unified audio taken by the letter, for phase tracking. */
    letterRatio: number;
}

/**
 * Audio engine for a feed card: plays the post's audio with Web Audio (Chrome/Firefox,
 * for reliable seeking), HTMLAudioElement (iOS/WebKit) or the legacy two-file format.
 * Tracks progress and letter/response phase, follows the global mute, and stops
 * when another card broadcasts pause-all.
 */
export function useFeedAudio({ unifiedAudioUrl, letterAudioUrl, responseAudioUrl, letterRatio }: UseFeedAudioOptions) {
    const { isMuted, toggleMute, pauseAll } = useAudioMute();

    const audioRef = useRef<FeedPlayer | null>(null);
    const webAudioCtxRef = useRef<AudioContext | null>(null);
    const decodedBufferRef = useRef<AudioBuffer | null>(null);
    const seekingRef = useRef(false);

    const [isPlaying, setIsPlaying] = useState(false);
    const [audioPhase, setAudioPhase] = useState<AudioPhase>('idle');
    const [audioProgress, setAudioProgress] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [audioCurrentTime, setAudioCurrentTime] = useState(0);
    const [isAudioLoading, setIsAudioLoading] = useState(false);

    const hasAudio = Boolean(unifiedAudioUrl) || Boolean(letterAudioUrl && responseAudioUrl);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe once per URL; audioDuration is only a skip guard, and re-running when it changes would cancel nothing useful
    }, [unifiedAudioUrl]);

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
                // Detect iOS/iPadOS — ALL browsers on iOS use WebKit under the hood
                // (Apple requires it), and WebKit's decodeAudioData truncates concatenated
                // MP3s to only the first stream. Use HTMLAudioElement on iOS instead.
                const isWebKitMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

                setIsAudioLoading(true);
                try {
                    if (isWebKitMobile) {
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

                        const safariPlayer: FeedPlayer = {
                            get currentTime() { return audio.currentTime; },
                            set currentTime(t: number) { audio.currentTime = t; },
                            get duration() { return audio.duration || 0; },
                            get muted() { return audio.muted; },
                            set muted(v: boolean) { audio.muted = v; },
                            play() { return audio.play(); },
                            pause() { audio.pause(); },
                        };

                        // Progress tracking via timeupdate
                        audio.ontimeupdate = () => {
                            if (!seekingRef.current && audio.duration) {
                                const progress = audio.currentTime / audio.duration;
                                setAudioProgress(progress);
                                setAudioCurrentTime(audio.currentTime);
                                const newPhase = progress < letterRatio ? 'letter' : 'response';
                                setAudioPhase(prev => prev !== newPhase && prev !== 'idle' ? newPhase : prev);
                            }
                        };

                        audio.onended = () => {
                            setIsPlaying(false);
                            setAudioPhase('idle');
                            setAudioProgress(0);
                            setAudioCurrentTime(0);
                            audioRef.current = null;
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
                        const buffer = audioBuffer;

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
                                const progress = ct / buffer.duration;
                                setAudioProgress(progress);
                                setAudioCurrentTime(ct);
                                const newPhase = progress < letterRatio ? 'letter' : 'response';
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
                            wapSource.buffer = buffer;
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
                                }
                            };
                            wapOffset = Math.max(0, Math.min(fromOffset, buffer.duration));
                            wapStartTime = playCtx.currentTime;
                            wapSource.start(0, wapOffset);
                            wapPlaying = true;
                            wapTick();
                        };

                        // Expose player interface on audioRef so seek/skip/pause-all work
                        const player: FeedPlayer = {
                            get currentTime() {
                                if (wapPlaying) return wapOffset + (playCtx.currentTime - wapStartTime);
                                return wapOffset;
                            },
                            set currentTime(t: number) {
                                const wasPlaying = wapPlaying;
                                if (wasPlaying) wapStop();
                                wapOffset = Math.max(0, Math.min(t, buffer.duration));
                                if (wasPlaying) wapPlay(wapOffset);
                            },
                            get duration() { return buffer.duration; },
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
                        };

                        audioRef.current = player;
                        setAudioPhase('letter');
                        setAudioDuration(buffer.duration);

                        await player.play();
                        setIsPlaying(true);
                    }
                } catch (err) {
                    console.error('Failed to load audio:', err);
                    setIsPlaying(false);
                } finally {
                    setIsAudioLoading(false);
                }
            } else if (letterAudioUrl) {
                // ── LEGACY FORMAT: two separate audio files ──
                const audio = new Audio(letterAudioUrl);
                audio.muted = isMuted;
                audioRef.current = audio;
                setAudioPhase('letter');

                audio.ontimeupdate = () => {
                    if (audio.duration && !seekingRef.current) {
                        setAudioProgress(audio.currentTime / audio.duration);
                    }
                };

                audio.onended = () => {
                    if (responseAudioUrl) {
                        const responseAudio = new Audio(responseAudioUrl);
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
                        };

                        responseAudio.play().catch(() => setIsPlaying(false));
                    } else {
                        setIsPlaying(false);
                        setAudioPhase('idle');
                        setAudioProgress(0);
                        audioRef.current = null;
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
    }, [isPlaying, audioPhase, unifiedAudioUrl, letterAudioUrl, responseAudioUrl, letterRatio, isMuted, pauseAll, isAudioLoading, hasAudio]);

    // Seek to a specific time (scrubber drag)
    const seek = useCallback((time: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setAudioCurrentTime(time);
            if (audioRef.current.duration) {
                setAudioProgress(time / audioRef.current.duration);
            }
        }
    }, []);

    // Skip forward/back by N seconds
    const skip = useCallback((delta: number) => {
        if (audioRef.current) {
            const newTime = Math.max(0, Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + delta));
            audioRef.current.currentTime = newTime;
            setAudioCurrentTime(newTime);
            if (audioRef.current.duration) {
                setAudioProgress(newTime / audioRef.current.duration);
            }
        }
    }, []);

    // Stop, reset to idle, then auto-play from the start once state has settled
    const restart = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setIsPlaying(false);
        setAudioPhase('idle');
        setAudioProgress(0);
        // Small delay so state settles, then auto-play from start
        setTimeout(() => toggleAudio(), 50);
    };

    // Sync global mute state to the active player
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.muted = isMuted;
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
            setIsPlaying(false);
            setAudioPhase('idle');
            setAudioProgress(0);
        };
        window.addEventListener(PAUSE_ALL_AUDIO_EVENT, handlePauseAll);
        return () => window.removeEventListener(PAUSE_ALL_AUDIO_EVENT, handlePauseAll);
    }, []);

    return {
        isPlaying,
        audioPhase,
        audioProgress,
        audioDuration,
        audioCurrentTime,
        isAudioLoading,
        isMuted,
        toggleMute,
        toggleAudio,
        seek,
        skip,
        restart,
    };
}

export type FeedAudio = ReturnType<typeof useFeedAudio>;
