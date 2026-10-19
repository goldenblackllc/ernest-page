"use client";

import { useState, useEffect, type RefObject } from "react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/auth/authFetch";
import type { Post, WordTimestamp } from "@/types/post";

interface Timestamps {
    audio_word_timestamps?: WordTimestamp[];
    short_audio_word_timestamps?: WordTimestamp[];
}

/**
 * The post with its word timestamps. The home feed leaves them out (they are most of
 * a post's size), so a card loads its own once it comes near the screen, before it
 * can play. Posts that already carry them (public feed, digest) are returned as is.
 */
export function usePostWordTimestamps(post: Post, cardRef: RefObject<HTMLElement | null>, hasAudio: boolean): Post {
    const { user } = useAuth();
    const [loaded, setLoaded] = useState<Timestamps | null>(null);
    const needsLoad = hasAudio && !post.audio_word_timestamps && !post.short_audio_word_timestamps;

    useEffect(() => {
        const node = cardRef.current;
        if (!user || !needsLoad || !node) return;

        let cancelled = false;
        const observer = new IntersectionObserver((entries) => {
            if (!entries[0].isIntersecting) return;
            observer.disconnect();
            authFetch(user, `/api/posts/timestamps?id=${encodeURIComponent(post.id)}`)
                .then((res) => (res.ok ? res.json() : null))
                .then((data) => {
                    if (cancelled || !data) return;
                    setLoaded({
                        audio_word_timestamps: data.audio_word_timestamps ?? undefined,
                        short_audio_word_timestamps: data.short_audio_word_timestamps ?? undefined,
                    });
                })
                .catch(() => { /* subtitles fall back to timing by word count */ });
        }, { rootMargin: '800px 0px' });

        observer.observe(node);
        return () => { cancelled = true; observer.disconnect(); };
    }, [user, needsLoad, post.id, cardRef]);

    return loaded ? { ...post, ...loaded } : post;
}
