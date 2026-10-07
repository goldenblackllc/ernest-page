"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { authFetch } from "@/lib/auth/authFetch";
import { cacheTTSBlob, getCachedTTSBlob, clearTTSCache } from "@/lib/ttsCache";
import type { Message } from "@/types/chat";

const SILENT_MP3 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwCHAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwCHAAAAAAAAAAAAAAAAAAAA';

// ═══ TTS — Split text into chunks at sentence boundaries ═══
function splitTextIntoChunks(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }

        // Find the last sentence-ending punctuation within the limit
        let splitAt = -1;
        const searchRegion = remaining.slice(0, maxLen);

        // Prefer splitting at sentence boundaries: . ! ? followed by a space
        for (let i = searchRegion.length - 1; i >= Math.floor(maxLen * 0.5); i--) {
            if ((searchRegion[i] === '.' || searchRegion[i] === '!' || searchRegion[i] === '?')
                && (i + 1 >= searchRegion.length || searchRegion[i + 1] === ' ')) {
                splitAt = i + 1;
                break;
            }
        }

        // Fallback: split at last space
        if (splitAt === -1) {
            splitAt = searchRegion.lastIndexOf(' ');
        }

        // Last resort: hard split at maxLen
        if (splitAt <= 0) {
            splitAt = maxLen;
        }

        chunks.push(remaining.slice(0, splitAt).trim());
        remaining = remaining.slice(splitAt).trim();
    }

    return chunks.filter(c => c.length > 0);
}

interface UseCharacterTTSOptions {
    isOpen: boolean;
    authUser: User | null | undefined;
    voiceId: string | null;
    messages: Message[];
    isLoading: boolean;
}

export function useCharacterTTS({ isOpen, authUser, voiceId, messages, isLoading }: UseCharacterTTSOptions) {
    const [autoSpeak, setAutoSpeak] = useState(() => {
        try { return localStorage.getItem('ep-auto-speak') === '1'; } catch { return false; }
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

    // ═══ TTS — Fetch audio blob(s) for full text, chunking if needed ═══
    const fetchTTSAudio = async (text: string): Promise<Blob | null> => {
        if (!voiceId) return null;

        // Strip markdown for cleaner speech
        const cleanText = text
            .replace(/[#*_~`>]/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/\n{2,}/g, '. ')
            .replace(/\n/g, ' ')
            .trim();

        if (!cleanText) return null;

        // Split into chunks that fit within ElevenLabs eleven_v3 limit (5000 chars)
        // Use 4800 as the chunk target to leave margin
        const chunks = splitTextIntoChunks(cleanText, 4800);

        try {
            const audioBlobs: Blob[] = [];

            for (const chunk of chunks) {
                const init: RequestInit = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: chunk, voiceId }),
                };
                const res = authUser
                    ? await authFetch(authUser, '/api/tts', init)
                    : await fetch('/api/tts', init);

                if (!res.ok) {
                    const errText = await res.text().catch(() => '');
                    console.error(`[TTS] Failed: ${res.status}`, errText);
                    // If any chunk fails, return whatever we have so far
                    break;
                }
                audioBlobs.push(await res.blob());
            }

            if (audioBlobs.length === 0) return null;

            // Single chunk — return directly (most common case)
            if (audioBlobs.length === 1) return audioBlobs[0];

            // Multiple chunks — concatenate into a single blob
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
                blob = await fetchTTSAudio(lastMsg.content);
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
    }, [messages, isLoading, voiceId]);

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
        const blob = await fetchTTSAudio(lastAssistant.content);
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
