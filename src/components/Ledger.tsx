import React, { useEffect, useState, useCallback } from "react";
import { collection, query, orderBy, limit, where, getDocs, doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { RecastPostCard } from "@/components/RecastPostCard";
import { CheckInPostCard } from "@/components/CheckInPostCard";
import { Sparkles, RefreshCw } from "lucide-react";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterProfile } from "@/types/character";
import { FollowAuthorModal } from "@/components/FollowAuthorModal";
import { FeedAdCard } from "@/components/FeedAdCard";
import { ecosystemAds } from "@/config/ecosystem";

export function Ledger() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingPostId, setPendingPostId] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedAuthorToFollow, setSelectedAuthorToFollow] = useState<string | null>(null);

    // 1. Subscribe to User Profile
    useEffect(() => {
        if (!user) return;
        const unsub = subscribeToCharacterProfile(user.uid, (p) => {
            setProfile(p);
        });
        return () => unsub();
    }, [user]);

    // 2. Fetch the Blended Feed Algorithm
    const fetchBlendedFeed = useCallback(async () => {
        if (!user || !profile) return;
        setIsRefreshing(true);

        try {
            const followingMap = profile.following || {};
            const followedIds = Object.keys(followingMap);
            let myRegion = profile.region || "";

            if (!myRegion) {
                try {
                    const res = await fetch('/api/user/region', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ uid: user.uid })
                    });
                    const data = await res.json();
                    if (data.region) {
                        myRegion = data.region;
                    }
                } catch (e) {
                    console.error("Failed to sync initial region:", e);
                }
            }

            const postsRef = collection(db, "posts");
            let blendedPosts: any[] = [];
            const seenIds = new Set<string>();

            // Helper to add unique posts
            const addPosts = (docs: any[]) => {
                docs.forEach(doc => {
                    if (!seenIds.has(doc.id)) {
                        seenIds.add(doc.id);
                        blendedPosts.push({ id: doc.id, ...doc.data() });
                    }
                });
            };

            // Bucket A: Mine
            // Note: We avoid composite indexes by fetching without order and sorting locally 
            // since this is a personal filter. But let's try ordering first.
            const queryA = query(postsRef, where("authorId", "==", user.uid), orderBy("created_at", "desc"), limit(10));
            try {
                const snapA = await getDocs(queryA);
                addPosts(snapA.docs);
            } catch (e) {
                // Fallback if index is missing (e.g. fresh deployment)
                const fallbackA = query(postsRef, where("authorId", "==", user.uid), limit(20));
                const snapA = await getDocs(fallbackA);
                addPosts(snapA.docs);
            }

            // Bucket B: Following (Chunked because 'in' supports max 10)
            if (followedIds.length > 0) {
                // Chunk into arrays of 10
                for (let i = 0; i < followedIds.length; i += 10) {
                    const chunk = followedIds.slice(i, i + 10);
                    const queryB = query(postsRef, where("authorId", "in", chunk), orderBy("created_at", "desc"), limit(10));
                    try {
                        const snapB = await getDocs(queryB);
                        addPosts(snapB.docs);
                    } catch (e) {
                        const fallbackB = query(postsRef, where("authorId", "in", chunk), limit(20));
                        const snapB = await getDocs(fallbackB);
                        addPosts(snapB.docs);
                    }
                }
            }

            // Bucket C: Discovery
            const queryC = query(postsRef, orderBy("created_at", "desc"), limit(25));
            const snapC = await getDocs(queryC);

            const discoveryDocs = snapC.docs.filter(doc => {
                const data = doc.data();
                const isMe = data.authorId === user.uid;
                const isFollowed = followedIds.includes(data.authorId);
                const isSameRegion = myRegion && data.region === myRegion;
                return !isMe && !isFollowed && !isSameRegion;
            });

            addPosts(discoveryDocs.slice(0, 15)); // Limit discovery to 15 after filtering

            // Final Sort: Chronological descending
            blendedPosts.sort((a, b) => {
                const aTime = a.created_at?.toMillis() || 0;
                const bTime = b.created_at?.toMillis() || 0;
                return bTime - aTime;
            });

            setEntries(blendedPosts);
        } catch (error) {
            console.error("Failed to fetch blended feed:", error);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, [user, profile]);

    // Initial load when profile becomes available
    useEffect(() => {
        if (profile && loading) {
            fetchBlendedFeed();
        }
    }, [profile, loading, fetchBlendedFeed]);

    // Listen for checkout-publishing-start
    useEffect(() => {
        const handleStart = (e: any) => {
            const id = e.detail?.postId;
            if (id) {
                setPendingPostId(id);
                // Also optimistically scroll to top or just let the feed render the spinner
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        };

        window.addEventListener('checkin-publishing-start', handleStart);
        return () => {
            window.removeEventListener('checkin-publishing-start', handleStart);
        };
    }, []);

    // Monitor the background check-in post
    useEffect(() => {
        if (!pendingPostId) return;

        const unsub = onSnapshot(doc(db, "posts", pendingPostId), (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                if (data.status === 'completed' || data.status === 'failed') {
                    setPendingPostId(null);
                    fetchBlendedFeed(); // Fetch the new post to show in feed
                }
            }
        });

        return () => unsub();
    }, [pendingPostId, fetchBlendedFeed]);

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
            <div className="flex justify-between items-center px-1 mb-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">The Feed</h3>
                <button
                    onClick={fetchBlendedFeed}
                    disabled={isRefreshing}
                    className="text-zinc-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>

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
                        {entry.type === 'checkin'
                            ? <CheckInPostCard
                                key={entry.id}
                                post={entry as any}
                                followingMap={profile?.following}
                                onFollowClick={(id) => setSelectedAuthorToFollow(id)}
                            />
                            : <RecastPostCard key={entry.id} post={entry as any} />}

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

