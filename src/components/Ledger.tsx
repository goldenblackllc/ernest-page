import React, { useEffect, useState, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { FeedPostCard } from "@/components/FeedPostCard";
import { Sparkles } from "lucide-react";
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
    const [followingMap, setFollowingMap] = useState<Record<string, string>>({});
    const [savedPosts, setSavedPosts] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingPostId, setPendingPostId] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedAuthorToFollow, setSelectedAuthorToFollow] = useState<string | null>(null);

    // Subscribe to user profile (needed for FollowAuthorModal)
    useEffect(() => {
        if (!user) return;
        const unsub = subscribeToCharacterProfile(user.uid, (p) => {
            setProfile(p);
        });
        return () => unsub();
    }, [user]);

    // Fetch the feed from the server-side API
    const fetchFeed = useCallback(async () => {
        if (!user) return;
        setIsRefreshing(true);

        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/posts/feed', {
                headers: { 'Authorization': `Bearer ${idToken}` },
            });

            if (!res.ok) {
                throw new Error(`Feed API returned ${res.status}`);
            }

            const data = await res.json();

            // Convert serialized timestamps back to Firestore Timestamps for compatibility
            const posts = (data.posts || []).map((post: any) => {
                if (post.created_at && post.created_at._seconds !== undefined) {
                    post.created_at = new Timestamp(post.created_at._seconds, post.created_at._nanoseconds || 0);
                }
                return post;
            });

            setEntries(posts);
            setFollowingMap(data.following || {});
            setSavedPosts(data.savedPosts || []);
        } catch (error) {
            console.error("Failed to fetch feed:", error);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, [user]);

    // Initial load
    useEffect(() => {
        if (user && loading) {
            fetchFeed();
        }
    }, [user, loading, fetchFeed]);

    // Auto-refresh: re-fetch when tab becomes visible again
    useEffect(() => {
        if (!user) return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !pendingPostId) {
                fetchFeed();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [user, fetchFeed, pendingPostId]);

    // Auto-refresh: poll every 60 seconds while tab is active
    useEffect(() => {
        if (!user || pendingPostId) return;

        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchFeed();
            }
        }, 60000);

        return () => clearInterval(interval);
    }, [user, fetchFeed, pendingPostId]);

    // Listen for checkout-publishing-start
    useEffect(() => {
        const handleStart = (e: any) => {
            const id = e.detail?.postId;
            if (id) {
                setPendingPostId(id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };

        window.addEventListener('checkin-publishing-start', handleStart);
        return () => {
            window.removeEventListener('checkin-publishing-start', handleStart);
        };
    }, []);

    // Monitor the background check-in post (own post — no privacy concern)
    useEffect(() => {
        if (!pendingPostId) return;

        const unsub = onSnapshot(doc(db, "posts", pendingPostId), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.status === 'completed' || data.status === 'failed') {
                    setPendingPostId(null);
                    fetchFeed();
                }
            }
        });

        return () => unsub();
    }, [pendingPostId, fetchFeed]);

    if (loading) {
        return <div className="p-12 text-center text-xs uppercase tracking-widest animate-pulse">Syncing Reality...</div>;
    }

    if (entries.length === 0 && !pendingPostId) {
        return (
            <div className="p-12 text-center border border-zinc-800 border-dashed rounded-xl bg-transparent">
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-mono">Log is empty.</p>
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

                return (
                    <React.Fragment key={`entry-group-${entry.id}`}>
                        <FeedPostCard
                            key={entry.id}
                            post={entry as any}
                            followingMap={followingMap}
                            onFollowClick={(id) => setSelectedAuthorToFollow(id)}
                            savedPosts={savedPosts}
                        />
                        {isAdSlot && <FeedAdCard ad={ad} />}
                    </React.Fragment>
                );
            })}

            <FollowAuthorModal
                isOpen={!!selectedAuthorToFollow}
                onClose={() => setSelectedAuthorToFollow(null)}
                postAuthorId={selectedAuthorToFollow || ''}
                profile={profile}
            />
        </section>
    );
}
