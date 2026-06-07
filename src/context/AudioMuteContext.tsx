'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const MUTE_KEY = 'ep-audio-muted';

interface AudioMuteContextType {
    isMuted: boolean;
    toggleMute: () => void;
}

const AudioMuteContext = createContext<AudioMuteContextType>({
    isMuted: true,
    toggleMute: () => {},
});

export const useAudioMute = () => useContext(AudioMuteContext);

export const AudioMuteProvider = ({ children }: { children: React.ReactNode }) => {
    // Default to muted — safe for social/public settings
    const [isMuted, setIsMuted] = useState(true);

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

    return (
        <AudioMuteContext.Provider value={{ isMuted, toggleMute }}>
            {children}
        </AudioMuteContext.Provider>
    );
};
