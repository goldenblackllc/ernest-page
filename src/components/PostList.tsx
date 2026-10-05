"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { FeedPostCard } from "@/components/FeedPostCard";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { Loader2 } from "lucide-react";
import { Timestamp, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useLocale } from "next-intl";

interface PostListProps {
    /** Paginated API route returning { posts, nextCursor } */
    endpoint: string;
    emptyText: string;
    endText?: string;
    emptyIcon?: React.ReactNode;
}

export function PostList({ endpoint, emptyText, endText, emptyIcon }: PostListProps) {
    const { user } = useAuth();
    const locale = useLocale();
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const [postToDelete, setPostToDelete] = useState<string | null>(null);

    const handleConfirmDelete = async () => {
        if (!postToDelete) return;
        try {
            await deleteDoc(doc(db, "posts", postToDelete));
            setPosts(prev => prev.filter(p => p.id !== postToDelete));
        } catch (error) {
            console.error("Error deleting post:", error);
        }
        setPostToDelete(null);
    };

    const fetchPosts = useCallback(async (cursor?: string | null) => {
        if (!user) return;

        const isLoadMore = !!cursor;
        if (isLoadMore) setLoadingMore(true);

        try {
            const idToken = await user.getIdToken();
            const params = new URLSearchParams({ locale });
            if (cursor) params.set("cursor", cursor);

            const res = await fetch(`${endpoint}?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${idToken}` },
            });

            if (!res.ok) throw new Error(`API returned ${res.status}`);
            const data = await res.json();

            const mapped = (data.posts || []).map((post: any) => {
                if (post.created_at && post.created_at._seconds !== undefined) {
                    post.created_at = new Timestamp(post.created_at._seconds, post.created_at._nanoseconds || 0);
                }
                return post;
            });

            if (isLoadMore) {
                setPosts(prev => {
                    const existingIds = new Set(prev.map(e => e.id));
                    return [...prev, ...mapped.filter((p: any) => !existingIds.has(p.id))];
                });
            } else {
                setPosts(mapped);
            }

            setNextCursor(data.nextCursor || null);
        } catch (error) {
            console.error(`Failed to fetch ${endpoint}:`, error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [user, endpoint, locale]);

    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    // Infinite scroll
    useEffect(() => {
        if (!sentinelRef.current) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && nextCursor && !loadingMore) {
                    fetchPosts(nextCursor);
                }
            },
            { rootMargin: '200px' }
        );
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [nextCursor, loadingMore, fetchPosts]);

    if (loading) {
        return (
            <div className="flex flex-col gap-6">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-[#1a1a1a] border-b sm:border border-white/10 sm:rounded-xl overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-4">
                            <div className="w-10 h-10 rounded-full bg-zinc-800 animate-pulse" />
                            <div className="flex-1 space-y-2">
                                <div className="h-3 bg-zinc-800 rounded-full w-24 animate-pulse" />
                                <div className="h-2 bg-zinc-800/60 rounded-full w-16 animate-pulse" />
                            </div>
                        </div>
                        <div className="px-4 pb-4 space-y-2">
                            <div className="h-3 bg-zinc-800 rounded-full w-full animate-pulse" />
                            <div className="h-3 bg-zinc-800 rounded-full w-4/5 animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (posts.length === 0) {
        return (
            <div className="mx-4 sm:mx-0 p-12 text-center border border-zinc-800 border-dashed rounded-xl">
                {emptyIcon}
                <p className="text-sm text-zinc-500">{emptyText}</p>
            </div>
        );
    }

    return (
        <>
            <section className="flex flex-col gap-8">
                {posts.map((post) => (
                    <FeedPostCard
                        key={post.id}
                        post={post}
                        onRequestDelete={setPostToDelete}
                    />
                ))}

                <div ref={sentinelRef} className="h-1" />

                {loadingMore && (
                    <div className="flex items-center justify-center py-6">
                        <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                    </div>
                )}

                {endText && !nextCursor && !loadingMore && (
                    <div className="text-center py-8">
                        <p className="text-xs text-zinc-500">{endText}</p>
                    </div>
                )}
            </section>

            <DeleteConfirmationModal
                isOpen={postToDelete !== null}
                onClose={() => setPostToDelete(null)}
                onConfirm={handleConfirmDelete}
            />
        </>
    );
}
