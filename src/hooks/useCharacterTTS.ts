"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { authFetch } from "@/lib/auth/authFetch";
import { cacheTTSBlob, getCachedTTSBlob, clearTTSCache } from "@/lib/ttsCache";
import type { Message } from "@/types/chat";

const SILENT_MP3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwCHAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwCHAAAAAAAAAAAAAAAAAAAA';

interface UseCharacterTTSOptions {
    isOpen: boolean;
    authUser: User | null | undefined;
    voiceId: string | null;
    sessionId: string | null;
    messages: Message[];
    isLoading: boolean;
}

export function useCharacterTTS({ isOpen, authUser, voiceId, sessionId, messages, isLoading }: UseCharacterTTSOptions) {
    const [autoSpeak, setAutoSpeak] = useState(() => {
        // On by default; only an explicit 'off' ('0') turns it off.
        try { return localStorage.getItem('ep-auto-speak') !== '0'; } catch { return true; }
    });
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isLoadingTTS, setIsLoadingTTS] = useState(false);
    const [releasedMsgId, setReleasedMsgId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const preUnlockedAudio = useRef<HTMLAudioElement | null>(null);
    const lastSpokenIdRef = useRef<string | null>(null);
    const expectingVoiceRef = useRef(false);
    const cachedBlobRef = useRef<Blob | null>(null);
    const cachedBlobMsgIdRef = useRef<string | null>(null);
    const ttsInFlightMsgIdRef = useRef<string | null>(null);

    const toggleAutoSpeak = () => {
        setAutoSpeak(prev => {
            const next = !prev;
            try { localStorage.setItem('ep-auto-speak', next ? '1' : '0'); } catch {}
            return next;
        });
    };

    // Called from the send gesture, before the optimistic update.
    const prepareAudioForReply = async () => {
        if (!(autoSpeak && voiceId)) return;

        // iOS: set audio session to "ambient" so TTS mixes with Spotify/music
        // instead of pausing it. Supported on iOS Safari 16.4+.
        try {
            if ('audioSession' in navigator) {
                (navigator as any).audioSession.type = 'ambient';
            }
        } catch {}

        // Pre-unlock audio for mobile: create a silent audio element during the user gesture
        // so we can reuse it for TTS playback later without autoplay restrictions.
        try {
            const silentAudio = new Audio();
            silentAudio.src = SILENT_MP3;
            await silentAudio.play().catch(() => {});
            silentAudio.pause();
            preUnlockedAudio.current = silentAudio;
        } catch {}
    };

    // Signal that we're expecting a voice response — set BEFORE the response arrives
    // so shouldHoldLastMessage is true on the very first render with the new message.
    const expectVoiceReply = () => {
        if (autoSpeak && voiceId) {
            expectingVoiceRef.current = true;
        }
    };

    // ═══ TTS — Fetch audio for a stored message. The server looks up the text
    // and splits long replies into parts (X-TTS-Parts); the parts are joined here.
    const fetchTTSAudio = async (messageId: string): Promise<Blob | null> => {
        if (!voiceId || !sessionId || !authUser) return null;

        try {
            const audioBlobs: Blob[] = [];
            let parts = 1;

            for (let part = 0; part < parts; part++) {
                const res = await authFetch(authUser, '/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, messageId, part }),
                });

                if (!res.ok) {
                    const errText = await res.text().catch(() => '');
                    console.error(`[TTS] Failed: ${res.status}`, errText);
                    // If any part fails, return whatever we have so far
                    break;
                }
                parts = Number(res.headers.get('X-TTS-Parts')) || 1;
                audioBlobs.push(await res.blob());
            }

            if (audioBlobs.length === 0) return null;

            // Single part — return directly (most common case)
            if (audioBlobs.length === 1) return audioBlobs[0];

            // Multiple parts — concatenate into a single blob
            return new Blob(audioBlobs, { type: 'audio/mpeg' });
        } catch (err) {
            console.error('[TTS] Fetch failed:', err);
            return null;
        }
    };

    // ═══ TTS — Play a blob, returns a promise that resolves when playback ends ═══
    const playAudioBlob = (blob: Blob): Promise<void> => {
        return new Promise((resolve) => {
            // Stop any currently playing audio
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }

            const audioUrl = URL.createObjectURL(blob);

            // Reuse the pre-unlocked audio element if available (mobile autoplay fix)
            const audio = preUnlockedAudio.current || new Audio();
            preUnlockedAudio.current = null;
            audio.src = audioUrl;

            audio.onended = () => {
                setIsSpeaking(false);
                // Don't revoke — blob is cached for replay. URLs are cleaned up on close/unmount.
                audioRef.current = null;
                resolve();
            };

            audio.onerror = () => {
                console.error('[TTS] Audio playback error');
                setIsSpeaking(false);
                audioRef.current = null;
                resolve();
            };

            audioRef.current = audio;
            setIsSpeaking(true);

            audio.play().catch((err) => {
                console.error('[TTS] Play failed:', err);
                setIsSpeaking(false);
                resolve();
            });
        });
    };

    // Always generate TTS when a new assistant message arrives (if voiceId exists).
    // Audio is always fetched and cached — autoSpeak only controls whether it auto-plays.
    useEffect(() => {
        if (!voiceId || isLoading) return;

        const lastMsg = messages[messages.length - 1];
        if (!lastMsg || lastMsg.role !== 'assistant') return;
        if (lastMsg.id === lastSpokenIdRef.current) return;

        lastSpokenIdRef.current = lastMsg.id;
        ttsInFlightMsgIdRef.current = lastMsg.id;

        (async () => {
            // Check IndexedDB cache first — survives iOS page eviction on app switch
            const cached = await getCachedTTSBlob(lastMsg.id);

            let blob: Blob | null;
            if (cached) {
                blob = cached;
            } else {
                setIsLoadingTTS(true);
                blob = await fetchTTSAudio(lastMsg.id);
                // Persist to IndexedDB so it survives app switches
                if (blob) cacheTTSBlob(lastMsg.id, blob).catch(() => {});
            }

            ttsInFlightMsgIdRef.current = null;
            // Cache the blob for replay / manual play
            cachedBlobRef.current = blob;
            cachedBlobMsgIdRef.current = lastMsg.id;
            // Release: clear the hold flag and set released ID
            expectingVoiceRef.current = false;
            setReleasedMsgId(lastMsg.id);
            setIsLoadingTTS(false);
            // Auto-play only if speaker is on
            if (blob && autoSpeak) await playAudioBlob(blob);
        })();
    }, [messages, isLoading, voiceId, sessionId]);

    // Compute whether to hold the last assistant message during render (no flash).
    // Only hold when autoSpeak is on — when speaker is off, show the message immediately
    // and let the play button indicate TTS loading state.
    const lastMsg = messages[messages.length - 1];
    const shouldHoldLastMessage = !!(autoSpeak
        && expectingVoiceRef.current
        && !isLoading
        && lastMsg?.role === 'assistant'
        && lastMsg.id !== releasedMsgId);

    // Pause audio without destroying the element (supports resume)
    const pauseAudio = () => {
        if (audioRef.current) {
            audioRef.current.pause();
        }
        setIsSpeaking(false);
    };

    // Stop audio & destroy the element (used for full cleanup)
    const stopSpeaking = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setIsSpeaking(false);
    };

    // Resume paused audio
    const resumeAudio = () => {
        if (audioRef.current && audioRef.current.paused && !audioRef.current.ended) {
            audioRef.current.play().catch(() => setIsSpeaking(false));
            setIsSpeaking(true);
        }
    };

    // Smart play/pause handler for the inline button
    const handlePlayPause = async () => {
        // Currently playing → pause
        if (isSpeaking && audioRef.current) {
            pauseAudio();
            return;
        }
        // Paused mid-playback → resume from where we left off
        if (audioRef.current && audioRef.current.paused
            && !audioRef.current.ended && audioRef.current.currentTime > 0) {
            resumeAudio();
            return;
        }
        // In-memory cached blob ready → play from start
        if (cachedBlobRef.current) {
            playAudioBlob(cachedBlobRef.current);
            return;
        }
        const lastAssistant = messages[messages.length - 1];
        if (!lastAssistant || lastAssistant.role !== 'assistant') return;
        // TTS effect already in-flight for this message — let it finish
        if (ttsInFlightMsgIdRef.current === lastAssistant.id) return;
        // Check IndexedDB cache (survives iOS page eviction that wipes refs)
        setIsLoadingTTS(true);
        const cached = await getCachedTTSBlob(lastAssistant.id);
        if (cached) {
            cachedBlobRef.current = cached;
            cachedBlobMsgIdRef.current = lastAssistant.id;
            setIsLoadingTTS(false);
            await playAudioBlob(cached);
            return;
        }
        // Last resort — fetch from TTS API
        const blob = await fetchTTSAudio(lastAssistant.id);
        if (blob) {
            cachedBlobRef.current = blob;
            cachedBlobMsgIdRef.current = lastAssistant.id;
            cacheTTSBlob(lastAssistant.id, blob).catch(() => {});
        }
        setIsLoadingTTS(false);
        if (blob) await playAudioBlob(blob);
    };

    // Full cleanup — wipe cached blob (used on close/unmount)
    const cleanupAudio = () => {
        stopSpeaking();
        cachedBlobRef.current = null;
        cachedBlobMsgIdRef.current = null;
        clearTTSCache().catch(() => {});
    };

    // When speaker is toggled off, pause playback (don't destroy — play button stays available)
    useEffect(() => {
        if (!autoSpeak) pauseAudio();
    }, [autoSpeak]);

    useEffect(() => {
        return () => cleanupAudio();
    }, []);

    // Resume audio when returning to the PWA (iOS suspends audio on tab/app switch)
    useEffect(() => {
        if (!isOpen) return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && audioRef.current?.paused && isSpeaking) {
                // Audio was playing before we switched away — resume it
                audioRef.current.play().catch(() => {
                    // Autoplay blocked on return — user will need to tap replay
                    setIsSpeaking(false);
                });
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [isOpen, isSpeaking]);

    return {
        autoSpeak,
        toggleAutoSpeak,
        isSpeaking,
        isLoadingTTS,
        shouldHoldLastMessage,
        lastMsg,
        prepareAudioForReply,
        expectVoiceReply,
        handlePlayPause,
        cleanupAudio,
    };
}
