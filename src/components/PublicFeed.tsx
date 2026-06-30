'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FeedPostCard } from '@/components/FeedPostCard';
import { Loader2 } from 'lucide-react';

interface PublicPost {
    id: string;
    type: string;
    post_type?: string | null;
    pseudonym?: string | null;
    letter?: string | null;
    response?: string | null;
    imagen_url?: string | null;
    audio_url?: string | null;
    audio_letter_ratio?: number | null;
    audio_word_timestamps?: any[] | null;
    directive_title?: string | null;
    unexpected_yield?: string | null;
    author_avatar_url?: string | null;
    like_count?: number;
    comments?: number;
    created_at: { _seconds: number; _nanoseconds: number } | null;
}

export function PublicFeed() {
    const [posts, setPosts] = useState<PublicPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<number | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const fetchingRef = useRef(false);
    const sentinelRef = useRef<HTMLDivElement>(null);

    const fetchPosts = useCallback(async (cursor?: number) => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;

        try {
            const params = new URLSearchParams({ limit: '10' });
            if (cursor) params.set('cursor', String(cursor));

            const res = await fetch(`/api/posts/public?${params}`);
            const data = await res.json();

            if (data.posts?.length) {
                setPosts(prev => cursor ? [...prev, ...data.posts] : data.posts);
                setNextCursor(data.nextCursor);
                setHasMore(data.nextCursor !== null);
            } else {
                setHasMore(false);
            }
        } catch (err) {
            console.error('Failed to fetch public posts:', err);
            setHasMore(false);
        } finally {
            fetchingRef.current = false;
        }
    }, []);

    // Initial fetch
    useEffect(() => {
        fetchPosts().finally(() => setLoading(false));
    }, [fetchPosts]);

    // Infinite scroll observer
    useEffect(() => {
        if (!sentinelRef.current || !hasMore) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && nextCursor && !fetchingRef.current) {
                    setLoadingMore(true);
                    fetchPosts(nextCursor).finally(() => setLoadingMore(false));
                }
            },
            { rootMargin: '200px' }
        );

        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [hasMore, nextCursor, fetchPosts]);

    if (loading) {
        return (
            <section className="space-y-4 px-0 sm:px-4">
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="p-5 bg-zinc-900/40 rounded-2xl animate-pulse"
                        style={{ animationDelay: `${i * 150}ms` }}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-9 h-9 rounded-full bg-zinc-800/80" />
                            <div className="space-y-1.5">
                                <div className="h-3.5 w-24 bg-zinc-800/60 rounded" />
                                <div className="h-2.5 w-16 bg-zinc-800/40 rounded" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="h-3 w-full bg-zinc-800/50 rounded" />
                            <div className="h-3 w-3/4 bg-zinc-800/40 rounded" />
                        </div>
                    </div>
                ))}
            </section>
        );
    }

    if (posts.length === 0) return null;

    return (
        <section className="space-y-0">
            {posts.map((post) => (
                <FeedPostCard
                    key={post.id}
                    post={{ ...post, type: post.type || 'checkin', uid: '' } as any}
                />
            ))}

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="h-1" />

            {loadingMore && (
                <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
                </div>
            )}

            {!hasMore && posts.length > 0 && (
                <div className="text-center py-8">
                    <p className="text-xs text-zinc-600">You're all caught up.</p>
                </div>
            )}
        </section>
    );
}
