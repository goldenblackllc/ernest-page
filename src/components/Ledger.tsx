import React, { useEffect, useState, useCallback, useRef } from "react";
import { doc, onSnapshot, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { FeedPostCard } from "@/components/FeedPostCard";
import { DigestCard } from "@/components/DigestCard";
import { CheckInCard } from "@/components/CheckInCard";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";

import { Loader2 } from "lucide-react";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterProfile } from "@/types/character";
import { FollowAuthorModal } from "@/components/FollowAuthorModal";

import { Timestamp } from "firebase/firestore";
import { getFeedCache, setFeedCache } from "@/lib/feedCache";
import { getUserLocation, storeUserLocation } from "@/lib/geolocation";

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const CHECKIN_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function Ledger() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);

    // Restore from module-level cache so returning to this tab is instant
    const cache = getFeedCache();
    const [entries, setEntries] = useState<any[]>(cache.entries || []);
    const [followingMap, setFollowingMap] = useState<Record<string, string>>(cache.followingMap || {});
    const [loading, setLoading] = useState(cache.entries === null); // skip skeleton if cached

    const [pendingPostId, setPendingPostId] = useState<string | null>(null);
    const [selectedAuthorToFollow, setSelectedAuthorToFollow] = useState<string | null>(null);
    const [postToDelete, setPostToDelete] = useState<string | null>(null);

    const handleConfirmDelete = async () => {
        if (!postToDelete) return;
        try {
            await deleteDoc(doc(db, "posts", postToDelete));
            setEntries(prev => prev.filter(e => e.id !== postToDelete));
        } catch (error) {
            console.error("Error deleting post:", error);
        }
        setPostToDelete(null);
    };

    const newestPostTimeRef = useRef<string | null>(cache.newestPostTime);
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Subscribe to user profile
    useEffect(() => {
        if (!user) return;
        const unsub = subscribeToCharacterProfile(user.uid, (p) => setProfile(p));
        return () => unsub();
    }, [user]);

    // Silently capture & store user location for proximity filtering
    useEffect(() => {
        if (!user) return;
        (async () => {
            const coords = await getUserLocation();
            if (coords) {
                await storeUserLocation(user.uid, coords);
            }
        })();
    }, [user]);

    // Fetch feed (full refresh, no pagination)
    const fetchFeed = useCallback(async () => {
        if (!user) return;

        try {
            const idToken = await user.getIdToken();

            const res = await fetch(`/api/posts/feed`, {
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

            setEntries(posts);
            setFollowingMap(data.following || {});

            // Persist to module-level cache for instant re-mount
            const newNewest = posts.length > 0
                ? (() => {
                    const newest = posts[0];
                    const time = newest.created_at?.toMillis?.() || (newest.created_at?._seconds ? newest.created_at._seconds * 1000 : 0);
                    return time ? new Date(time).toISOString() : newestPostTimeRef.current;
                })()
                : newestPostTimeRef.current;
            newestPostTimeRef.current = newNewest;
            setFeedCache(posts, data.following || {}, newNewest);
        } catch (error) {
            console.error("Failed to fetch feed:", error);
        } finally {
            setLoading(false);
        }
    }, [user]);


    // Initial load
    useEffect(() => {
        if (user && loading) {
            fetchFeed();
        }
    }, [user, loading, fetchFeed]);

    // Visibility-aware poll for new posts (every 15 minutes, only when tab visible)
    useEffect(() => {
        if (!user) return;

        const checkForNewPosts = async () => {
            if (document.visibilityState !== "visible") return;
            if (!newestPostTimeRef.current) return;

            try {
                const idToken = await user.getIdToken();
                const params = new URLSearchParams({ newer_than: newestPostTimeRef.current });

                const res = await fetch(`/api/posts/feed?${params.toString()}`, {
                    headers: { 'Authorization': `Bearer ${idToken}` },
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.newPostCount > 0) {
                        fetchFeed();
                    }
                }
            } catch {
                // Silent — non-critical polling
            }
        };

        // Start polling interval
        pollTimerRef.current = setInterval(checkForNewPosts, POLL_INTERVAL_MS);

        // Pause/resume on visibility change
        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                // Resume: check immediately, then restart interval
                checkForNewPosts();
                if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                pollTimerRef.current = setInterval(checkForNewPosts, POLL_INTERVAL_MS);
            } else {
                // Pause: clear interval
                if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [user]);

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

    // Bible generation status — backed by Firestore, survives page reloads
    // IMPORTANT: These hooks must be ABOVE all early returns to satisfy Rules of Hooks
    const bibleStatus = profile?.character_bible?.status;
    const showBibleCompiling = bibleStatus === 'compiling';
    const showBibleReady = bibleStatus === 'ready';

    const dismissBibleReady = async () => {
        if (!user) return;
        try {
            const { doc: firestoreDoc, updateDoc: firestoreUpdate } = await import('firebase/firestore');
            await firestoreUpdate(firestoreDoc(db, 'users', user.uid), {
                'character_bible.status': 'stable',
            });
        } catch (e) {
            console.error('Failed to dismiss bible ready card:', e);
        }
    };


    // Auto-dismiss bible ready card after 15 minutes
    useEffect(() => {
        if (!showBibleReady || !user) return;

        const lc = profile?.character_bible?.last_commit;
        const commitTime = lc?.toMillis
            ? lc.toMillis()
            : lc?.seconds
                ? lc.seconds * 1000
                : null;

        // No timestamp available — treat as stale and dismiss immediately
        if (!commitTime) {
            dismissBibleReady();
            return;
        }

        const ageMs = Date.now() - commitTime;
        const fifteenMin = 15 * 60 * 1000;

        if (ageMs >= fifteenMin) {
            dismissBibleReady();
        } else {
            const timer = setTimeout(() => {
                dismissBibleReady();
            }, fifteenMin - ageMs);
            return () => clearTimeout(timer);
        }
    }, [showBibleReady, user, profile?.character_bible?.last_commit]);

    // Skeleton loading
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
        <section className="flex flex-col gap-6 pt-2">

            {/* Bible Generation Status Card */}
            {showBibleCompiling && (
                <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden shadow-sm relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent animate-pulse" />
                    <div className="flex items-center gap-4 p-5 relative">
                        <div className="w-12 h-12 rounded-full border-2 border-zinc-700 border-t-white animate-spin shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-white mb-0.5">Compiling your Blueprint...</p>
                            <p className="text-xs text-zinc-500">Building your Ideal Self and generating your portrait. This can take up to a minute.</p>
                        </div>
                    </div>
                </div>
            )}

            {showBibleReady && (
                <button
                    onClick={() => {
                        dismissBibleReady();
                        window.location.href = '/profile';
                    }}
                    className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden shadow-sm relative text-left w-full hover:bg-zinc-800 transition-colors"
                >
                    <div className="flex items-center gap-4 p-5">
                        <div className="w-14 h-14 rounded-full bg-zinc-800 border-2 border-white/20 overflow-hidden shrink-0">
                            {profile?.character_bible?.compiled_output?.avatar_url ? (
                                <img src={profile.character_bible.compiled_output.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Loader2 className="w-5 h-5 text-zinc-100 animate-spin" />
                                </div>
                            )}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-white mb-0.5">Build Finished ✓</p>
                            <p className="text-base font-bold text-white">{profile?.identity?.title || 'Your Ideal Self'}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">Tap to view your Ideal Self →</p>
                        </div>
                    </div>
                </button>
            )}

            {/* 30-Day Check-in Card */}
            {(() => {
                const anchor = profile?.last_thirty_day_checkin || profile?.subscription?.subscribedAt;
                if (!anchor) return null;
                const elapsed = Date.now() - new Date(anchor).getTime();
                if (elapsed < CHECKIN_INTERVAL_MS) return null;
                return (
                    <CheckInCard
                        characterTitle={profile?.identity?.title || 'Your Ideal Self'}
                        avatarUrl={profile?.character_bible?.compiled_output?.avatar_url}
                    />
                );
            })()}

            {pendingPostId && (
                <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative animate-pulse flex items-center justify-center p-8">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-zinc-300 animate-spin" />
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest inline-block text-center mt-2">
                            Writing to Dear Earnest...
                        </span>
                    </div>
                </div>
            )}

            {entries.map((entry, index) => (
                <React.Fragment key={entry.id}>
                    {/* Insert digest card as the 3rd item */}
                    {index === 2 && profile?.daily_digest?.title && (
                        <DigestCard
                            title={profile.daily_digest.title}
                            content={profile.daily_digest.full_content || profile.daily_digest.content}
                            imageUrl={profile.daily_digest.image_url}
                        />
                    )}
                    <FeedPostCard
                        post={entry as any}
                        followingMap={followingMap}
                        onFollowClick={(id) => setSelectedAuthorToFollow(id)}
                        onRequestDelete={setPostToDelete}
                    />
                </React.Fragment>
            ))}

            {/* End of feed */}
            {entries.length > 0 && (
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

            <DeleteConfirmationModal
                isOpen={postToDelete !== null}
                onClose={() => setPostToDelete(null)}
                onConfirm={handleConfirmDelete}
            />
        </section>
    );
}
