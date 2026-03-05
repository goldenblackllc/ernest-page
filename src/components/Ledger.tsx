import React, { useEffect, useState, useCallback, useRef } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { FeedPostCard } from "@/components/FeedPostCard";
import { SignalCard, SignalData } from "@/components/SignalCard";
import { Sparkles, Loader2 } from "lucide-react";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterProfile } from "@/types/character";
import { FollowAuthorModal } from "@/components/FollowAuthorModal";
import { FeedAdCard } from "@/components/FeedAdCard";
import { ecosystemAds } from "@/config/ecosystem";
import { Timestamp } from "firebase/firestore";

export function Ledger() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const [entries, setEntries] = useState<any[]>([]);
    const [signals, setSignals] = useState<SignalData[]>([]);
    const [followingMap, setFollowingMap] = useState<Record<string, string>>({});

    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [pendingPostId, setPendingPostId] = useState<string | null>(null);
    const [selectedAuthorToFollow, setSelectedAuthorToFollow] = useState<string | null>(null);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);

    // Subscribe to user profile
    useEffect(() => {
        if (!user) return;
        const unsub = subscribeToCharacterProfile(user.uid, (p) => setProfile(p));
        return () => unsub();
    }, [user]);

    // Fetch feed (initial or paginated)
    const fetchFeed = useCallback(async (cursor?: string | null) => {
        if (!user) return;

        const isLoadMore = !!cursor;
        if (isLoadMore) {
            setLoadingMore(true);
        }

        try {
            const idToken = await user.getIdToken();
            const params = new URLSearchParams();
            if (cursor) params.set("cursor", cursor);

            const res = await fetch(`/api/posts/feed?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${idToken}` },
            });

            if (!res.ok) throw new Error(`Feed API returned ${res.status}`);

            const data = await res.json();

            const posts = (data.posts || []).map((post: any) => {
                if (post.created_at && post.created_at._seconds !== undefined) {
                    post.created_at = new Timestamp(post.created_at._seconds, post.created_at._nanoseconds || 0);
                }
                return post;
            });

            if (isLoadMore) {
                // Append, deduplicate by id
                setEntries(prev => {
                    const existingIds = new Set(prev.map(e => e.id));
                    const newPosts = posts.filter((p: any) => !existingIds.has(p.id));
                    return [...prev, ...newPosts];
                });
            } else {
                setEntries(posts);
                // Store signals from the initial fetch
                if (data.signals && data.signals.length > 0) {
                    setSignals(data.signals);
                }
            }

            setFollowingMap(data.following || {});

            setNextCursor(data.nextCursor || null);
        } catch (error) {
            console.error("Failed to fetch feed:", error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [user]);

    // Initial load
    useEffect(() => {
        if (user && loading) {
            fetchFeed();
        }
    }, [user, loading, fetchFeed]);

    // Infinite scroll: IntersectionObserver on sentinel
    useEffect(() => {
        if (!sentinelRef.current) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && nextCursor && !loadingMore) {
                    fetchFeed(nextCursor);
                }
            },
            { rootMargin: '200px' } // Start loading 200px before reaching bottom
        );

        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [nextCursor, loadingMore, fetchFeed]);

    // Listen for checkin-publishing-start
    useEffect(() => {
        const handleStart = (e: any) => {
            const id = e.detail?.postId;
            if (id) {
                setPendingPostId(id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };

        window.addEventListener('checkin-publishing-start', handleStart);
        return () => window.removeEventListener('checkin-publishing-start', handleStart);
    }, []);

    // Monitor background check-in post
    useEffect(() => {
        if (!pendingPostId) return;

        const unsub = onSnapshot(doc(db, "posts", pendingPostId), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.status === 'completed' || data.status === 'failed') {
                    setPendingPostId(null);
                    // Refresh from the top to show the new post
                    setLoading(true);
                }
            }
        });

        return () => unsub();
    }, [pendingPostId]);

    // Skeleton loading (fast, native feel)
    if (loading) {
        return (
            <section className="flex flex-col gap-6">
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
                            <div className="h-3 bg-zinc-800 rounded-full w-3/5 animate-pulse" />
                        </div>
                        <div className="h-48 bg-zinc-800/50 animate-pulse" />
                    </div>
                ))}
            </section>
        );
    }

    if (entries.length === 0 && !pendingPostId) {
        return (
            <div className="p-12 text-center border border-zinc-800 border-dashed rounded-xl bg-transparent">
                <p className="text-sm text-zinc-500">No posts yet. Start a conversation to create your first post.</p>
            </div>
        );
    }

    return (
        <section className="flex flex-col gap-8">
            {pendingPostId && (
                <div className="bg-[#1a1a1a] border border-emerald-500/20 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative animate-pulse flex items-center justify-center p-8">
                    <div className="flex flex-col items-center gap-3">
                        <Sparkles className="w-6 h-6 text-emerald-500/80 animate-spin-slow" />
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest inline-block text-center mt-2">
                            Writing to Dear Earnest...
                        </span>
                    </div>
                </div>
            )}

            {entries.map((entry, index) => {
                const isAdSlot = (index + 1) % 5 === 0;
                const adIndex = Math.floor(index / 5);
                const ad = ecosystemAds[adIndex % ecosystemAds.length];

                // Insert a signal card every ~4 posts (at positions 3, 7, 11, ...)
                const signalSlotIndex = Math.floor((index + 1) / 4) - 1;
                const shouldShowSignal = (index + 1) % 4 === 0 && signalSlotIndex < signals.length;
                const signalForSlot = shouldShowSignal ? signals[signalSlotIndex] : null;

                return (
                    <React.Fragment key={`entry-group-${entry.id}`}>
                        <FeedPostCard
                            key={entry.id}
                            post={entry as any}
                            followingMap={followingMap}
                            onFollowClick={(id) => setSelectedAuthorToFollow(id)}
                        />
                        {signalForSlot && <SignalCard key={`signal-${signalForSlot.id}`} signal={signalForSlot} />}
                        {isAdSlot && <FeedAdCard ad={ad} />}
                    </React.Fragment>
                );
            })}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-1" />

            {/* Loading more indicator */}
            {loadingMore && (
                <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                </div>
            )}

            {/* End of feed */}
            {!nextCursor && entries.length > 0 && !loadingMore && (
                <div className="text-center py-8">
                    <p className="text-xs text-zinc-600">You're all caught up.</p>
                </div>
            )}

            <FollowAuthorModal
                isOpen={!!selectedAuthorToFollow}
                onClose={() => setSelectedAuthorToFollow(null)}
                postAuthorId={selectedAuthorToFollow || ''}
                profile={profile}
            />
        </section>
    );
}
