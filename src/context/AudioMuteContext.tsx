'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const MUTE_KEY = 'ep-audio-muted';

/** Custom event name used to signal all audio-playing components to pause. */
export const PAUSE_ALL_AUDIO_EVENT = 'ep-pause-all-audio';

interface AudioMuteContextType {
    isMuted: boolean;
    toggleMute: () => void;
    /** Dispatch a global pause signal — all audio-playing components should stop playback. */
    pauseAll: () => void;
    /** When true, IntersectionObserver auto-play should be suppressed (e.g. MirrorChat is open). */
    isAutoPlaySuppressed: boolean;
    /** Suppress auto-play (pauses all audio and prevents future auto-play until unsuppressed). */
    suppressAutoPlay: () => void;
    /** Re-enable auto-play. */
    unsuppressAutoPlay: () => void;
}

const AudioMuteContext = createContext<AudioMuteContextType>({
    isMuted: true,
    toggleMute: () => {},
    pauseAll: () => {},
    isAutoPlaySuppressed: false,
    suppressAutoPlay: () => {},
    unsuppressAutoPlay: () => {},
});

export const useAudioMute = () => useContext(AudioMuteContext);

export const AudioMuteProvider = ({ children }: { children: React.ReactNode }) => {
    // Default to muted — safe for social/public settings
    const [isMuted, setIsMuted] = useState(true);
    const [isAutoPlaySuppressed, setIsAutoPlaySuppressed] = useState(false);

    // Hydrate from localStorage after mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(MUTE_KEY);
            if (stored === '0') {
                setIsMuted(false);
            }
            // If stored is '1' or absent, stay muted (default)
        } catch { /* localStorage unavailable — non-critical */ }
    }, []);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => {
            const next = !prev;
            try {
                localStorage.setItem(MUTE_KEY, next ? '1' : '0');
            } catch { /* non-critical */ }
            return next;
        });
    }, []);

    const pauseAll = useCallback(() => {
        window.dispatchEvent(new Event(PAUSE_ALL_AUDIO_EVENT));
    }, []);

    const suppressAutoPlay = useCallback(() => {
        setIsAutoPlaySuppressed(true);
        window.dispatchEvent(new Event(PAUSE_ALL_AUDIO_EVENT));
    }, []);

    const unsuppressAutoPlay = useCallback(() => {
        setIsAutoPlaySuppressed(false);
    }, []);

    return (
        <AudioMuteContext.Provider value={{ isMuted, toggleMute, pauseAll, isAutoPlaySuppressed, suppressAutoPlay, unsuppressAutoPlay }}>
            {children}
        </AudioMuteContext.Provider>
    );
};
