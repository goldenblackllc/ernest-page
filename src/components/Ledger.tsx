import React, { useEffect, useState, useCallback, useRef } from "react";
import { doc, onSnapshot, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { FeedPostCard } from "@/components/FeedPostCard";
import { DigestCard } from "@/components/DigestCard";
import { CheckInCard } from "@/components/CheckInCard";
import { VoiceBrowser } from "@/components/VoiceBrowser";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";

import { Loader2 } from "lucide-react";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterProfile } from "@/types/character";
import { FollowAuthorModal } from "@/components/FollowAuthorModal";
import { useTranslations, useLocale } from "next-intl";

import { Timestamp } from "firebase/firestore";
import { getFeedCache, setFeedCache } from "@/lib/feedCache";
import { getUserLocation, storeUserLocation } from "@/lib/geolocation";

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const CHECKIN_INTERVAL_MS = 28 * 24 * 60 * 60 * 1000; // 28 days
const CHECKIN_WINDOW_MS = 35 * 24 * 60 * 60 * 1000; // 35 days (7-day window to act)

export function Ledger() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const [profileLoaded, setProfileLoaded] = useState(false);
    const t = useTranslations('feed');

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
        const unsub = subscribeToCharacterProfile(user.uid, (p) => {
            setProfile(p);
            setProfileLoaded(true);
        });
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
    const locale = useLocale();
    const fetchFeed = useCallback(async () => {
        if (!user) return;

        try {
            const idToken = await user.getIdToken();

            const res = await fetch(`/api/posts/feed?locale=${locale}`, {
                headers: { 'Authorization': `Bearer ${idToken}` },
                cache: 'no-store',
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

            // Auto-translate posts that don't have a cached translation yet
            const needsTranslation: string[] = data.needsTranslation || [];
            if (needsTranslation.length > 0) {
                fetch('/api/posts/translate/batch', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`,
                    },
                    body: JSON.stringify({ postIds: needsTranslation, targetLocale: locale }),
                })
                    .then(r => r.json())
                    .then(result => {
                        if (result.translations && Object.keys(result.translations).length > 0) {
                            setEntries(prev => prev.map(p => {
                                if (result.translations[p.id]) {
                                    return { ...p, _translated: result.translations[p.id] };
                                }
                                return p;
                            }));
                        }
                    })
                    .catch(err => console.error('Batch translation failed:', err));
            }
        } catch (error) {
            console.error("Failed to fetch feed:", error);
        } finally {
            setLoading(false);
        }
    }, [user, locale]);


    // Initial load + stale-while-revalidate
    // When we have cached data, render it instantly but always fetch fresh data.
    useEffect(() => {
        if (!user) return;
        if (loading) {
            // No cache — full load with skeleton
            fetchFeed();
        } else {
            // Cache hit — background refresh (stale-while-revalidate)
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
                    cache: 'no-store',
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

    // Listen for pull-to-refresh trigger
    useEffect(() => {
        const handleRefresh = () => {
            setLoading(true);
        };

        window.addEventListener('ledger-refresh', handleRefresh);
        return () => window.removeEventListener('ledger-refresh', handleRefresh);
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
    const hasBuiltCharacter = !!profile?.character_bible?.compiled_output?.avatar_url
        || (profile?.character_bible?.compiled_output?.ideal?.length ?? 0) > 0;
    // Treat "not built yet" the same as "compiling" to avoid premature empty-state CTA
    const isAwaitingBuild = !bibleStatus && !hasBuiltCharacter && !!profile?.identity?.onboarding_complete;
    const showBibleCompiling = bibleStatus === 'compiling' || isAwaitingBuild;
    const showBibleReady = bibleStatus === 'ready';

    // Detect failed compilations
    const showBibleFailed = bibleStatus === 'failed';
    const bibleFailReason = profile?.character_bible?.fail_reason as string | undefined;

    // Detect stale compilations (stuck > 4 minutes)
    const STALE_THRESHOLD_MS = 4 * 60 * 1000; // 4 minutes
    const bibleLastUpdated = profile?.character_bible?.last_updated;
    const isStaleCompilation = showBibleCompiling && bibleLastUpdated
        && (Date.now() - bibleLastUpdated) > STALE_THRESHOLD_MS;

    const [retrying, setRetrying] = useState(false);
    const retryCompile = useCallback(async () => {
        if (!user || !profile?.character_bible?.source_code || retrying) return;
        setRetrying(true);
        try {
            const { doc: firestoreDoc, updateDoc: firestoreUpdate } = await import('firebase/firestore');
            // Reset status to compiling + fresh timestamp
            await firestoreUpdate(firestoreDoc(db, 'users', user.uid), {
                'character_bible.status': 'compiling',
                'character_bible.last_updated': Date.now(),
            });
            // Trigger the compile
            const idToken = await user.getIdToken();
            const res = await fetch('/api/onboarding/retry-compile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
            });
            if (!res.ok) {
                console.error('[Ledger] Retry compile failed:', res.status);
                // Reset status so the user can retry instead of seeing an infinite spinner
                const { doc: d, updateDoc: u } = await import('firebase/firestore');
                await u(d(db, 'users', user.uid), { 'character_bible.status': 'failed' });
            }
        } catch (err) {
            console.error('[Ledger] Retry compile error:', err);
            try {
                const { doc: d, updateDoc: u } = await import('firebase/firestore');
                await u(d(db, 'users', user.uid), { 'character_bible.status': 'failed' });
            } catch { /* best-effort */ }
        } finally {
            setRetrying(false);
        }
    }, [user, profile?.character_bible?.source_code, retrying]);

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

    // Render feed or empty states
    const isFeedEmpty = entries.length === 0 && !pendingPostId && !showBibleCompiling && !showBibleFailed && profileLoaded;

    if (isFeedEmpty) {
        const sessionCredits = profile?.session_credits || 0;
        const sub = profile?.subscription;
        const subEndDate = sub?.currentPeriodEnd || sub?.subscribedUntil;
        const hasActiveSub = (sub?.status === 'active' || sub?.status === 'past_due') && subEndDate && new Date(subEndDate) > new Date();
        const isNewUser = !profile?.identity?.session_count || profile.identity.session_count < 1;

        let badgeText = t('yourFirstSession');
        if (hasActiveSub) {
            badgeText = t('sessionsAvailable');
        } else if (sessionCredits > 0) {
            badgeText = `${sessionCredits} ${sessionCredits === 1 ? t('sessionAvailable') : t('sessionsAvailable')}`;
        } else if (!isNewUser) {
            badgeText = t('yourFirstSession'); // Fallback for 0-credit returners with deleted feeds
        }

        const emptyStateContent = (
            <div className="flex flex-col items-center text-center pt-6 pb-32 px-8">
                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-4 font-bold">
                    {badgeText}
                </p>
                <h2 className="text-2xl font-black tracking-tight text-white mb-3">
                    {profile?.identity?.title || t('idealSelfDefault')}
                </h2>
                <p className="text-sm text-zinc-400 max-w-xs mx-auto leading-relaxed mb-8">
                    {t('firstSessionSub')}
                </p>
                <button
                    onClick={() => window.dispatchEvent(new CustomEvent('open-mirror-chat'))}
                    className="bg-white text-black text-sm font-bold px-8 py-3.5 rounded-full hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150"
                >
                    {t('startNow')}
                </button>
            </div>
        );

        return (
            <section className="flex flex-col gap-6 pt-2 pb-24">
                {/* Bible ready card still renders at top if active */}
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
                                <p className="text-sm font-bold text-white mb-0.5">{t('bibleReadyTitle')}</p>
                                <p className="text-base font-bold text-white">{profile?.identity?.title || t('idealSelfDefault')}</p>
                                <p className="text-xs text-zinc-500 mt-0.5">{t('bibleReadySub')}</p>
                            </div>
                        </div>
                    </button>
                )}

                {/* Ground Rules — visible in empty feed for new users */}
                {hasBuiltCharacter && (!profile?.identity?.session_count || profile.identity.session_count < 1) && (
                    <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden shadow-sm">
                        <div className="p-5">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-1">Before your first session</p>
                            <p className="text-sm font-bold text-white mb-4">Ground Rules</p>
                            <div className="space-y-2.5">
                                {[
                                    { icon: '✦', text: 'Be fully honest — say what you actually feel' },
                                    { icon: '✦', text: "If you disagree, say so — you won't offend anyone" },
                                    { icon: '✦', text: 'Commit to the full session — there is an end' },
                                    { icon: '✦', text: 'Answer every question, even the hard ones' },
                                    { icon: '✦', text: 'No one is listening. No one is judging you.' },
                                ].map((rule, i) => (
                                    <div
                                        key={i}
                                        className="flex items-start gap-2.5 opacity-0 animate-[fadeInUp_0.4s_ease-out_forwards]"
                                        style={{ animationDelay: `${i * 0.3}s` }}
                                    >
                                        <span className="text-white/40 text-xs mt-0.5 shrink-0">{rule.icon}</span>
                                        <p className="text-sm text-zinc-300 leading-snug">{rule.text}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Voice Selection — always show until user has confirmed a voice */}
                {user && !profile?.character_bible?.voice_confirmed && (
                    <VoiceBrowser
                        currentVoiceId={profile?.character_bible?.voice_id}
                        currentVoiceName={profile?.character_bible?.voice_name}
                        startOpen
                        compact
                        onVoiceSelected={async () => {
                            try {
                                const { doc: firestoreDoc, updateDoc: firestoreUpdate } = await import('firebase/firestore');
                                await firestoreUpdate(firestoreDoc(db, 'users', user.uid), {
                                    'character_bible.voice_confirmed': true,
                                });
                            } catch (err) {
                                console.error('Failed to confirm voice:', err);
                            }
                        }}
                    />
                )}

                {emptyStateContent}
            </section>
        );
    }

    return (
        <section className="flex flex-col gap-6 pt-2">

            {/* Bible Generation Status Card */}
            {showBibleCompiling && (
                <div className={`bg-zinc-900/50 border ${isStaleCompilation ? 'border-red-500/30' : 'border-white/10'} rounded-xl overflow-hidden shadow-sm relative`}>
                    {!isStaleCompilation && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent animate-pulse" />
                    )}
                    <div className="p-5 relative">
                        <div className="flex items-center gap-4 mb-4">
                            {isStaleCompilation ? (
                                <div className="w-12 h-12 rounded-full border-2 border-red-500/40 flex items-center justify-center shrink-0">
                                    <span className="text-red-400 text-lg">!</span>
                                </div>
                            ) : (
                                <div className="w-12 h-12 rounded-full border-2 border-zinc-700 border-t-white animate-spin shrink-0" />
                            )}
                            <div className="flex-1">
                                <p className="text-sm font-bold text-white mb-0.5">
                                    {isStaleCompilation ? t('bibleStaleTitle') : t('bibleCompilingTitle')}
                                </p>
                                <p className="text-xs text-zinc-500">
                                    {isStaleCompilation ? t('bibleStaleSub') : t('bibleCompilingSub')}
                                </p>
                            </div>
                        </div>

                        {/* Onboarding Ground Rules */}
                        {!isStaleCompilation && (
                            <div className="border-t border-white/5 pt-4 mt-2">
                                <p className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold mb-3">Before your first session</p>
                                <div className="space-y-2.5">
                                    {[
                                        { icon: '✦', text: 'Be fully honest — say what you actually feel' },
                                        { icon: '✦', text: "If you disagree, say so — you won't offend anyone" },
                                        { icon: '✦', text: 'Commit to the full session — there is an end' },
                                        { icon: '✦', text: 'Answer every question, even the hard ones' },
                                        { icon: '✦', text: 'No one is listening. No one is judging you.' },
                                    ].map((rule, i) => (
                                        <div
                                            key={i}
                                            className="flex items-start gap-2.5 opacity-0 animate-[fadeInUp_0.4s_ease-out_forwards]"
                                            style={{ animationDelay: `${i * 0.6}s` }}
                                        >
                                            <span className="text-white/40 text-xs mt-0.5 shrink-0">{rule.icon}</span>
                                            <p className="text-sm text-zinc-300 leading-snug">{rule.text}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}


                        {isStaleCompilation && (
                            <button
                                onClick={retryCompile}
                                disabled={retrying}
                                className="mt-3 px-4 py-2 text-xs font-semibold bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
                            >
                                {retrying ? t('bibleRetrying') : t('bibleRetry')}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Bible Failed Card — shown when compile errored out */}
            {showBibleFailed && (() => {
                const isDaily = bibleFailReason === 'rate_limit_daily';
                const isCooldown = bibleFailReason === 'rate_limit_cooldown';
                const isRateLimit = isDaily || isCooldown;

                const title = isDaily ? t('bibleRateLimitDailyTitle')
                    : isCooldown ? t('bibleRateLimitCooldownTitle')
                    : t('bibleFailedTitle');
                const sub = isDaily ? t('bibleRateLimitDailySub')
                    : isCooldown ? t('bibleRateLimitCooldownSub')
                    : t('bibleFailedSub');

                const borderColor = isRateLimit ? 'border-amber-500/30' : 'border-red-500/30';
                const iconBorder = isRateLimit ? 'border-amber-500/40' : 'border-red-500/40';
                const iconColor = isRateLimit ? 'text-amber-400' : 'text-red-400';

                return (
                    <div className={`bg-zinc-900/50 border ${borderColor} rounded-xl overflow-hidden shadow-sm relative`}>
                        <div className="flex items-center gap-4 p-5 relative">
                            <div className={`w-12 h-12 rounded-full border-2 ${iconBorder} flex items-center justify-center shrink-0`}>
                                <span className={`${iconColor} text-lg`}>{isRateLimit ? '⏳' : '!'}</span>
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-white mb-0.5">
                                    {title}
                                </p>
                                <p className="text-xs text-zinc-500">
                                    {sub}
                                </p>
                                {!isDaily && (
                                    <button
                                        onClick={retryCompile}
                                        disabled={retrying}
                                        className="mt-3 px-4 py-2 text-xs font-semibold bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
                                    >
                                        {retrying ? t('bibleRetrying') : t('bibleRetry')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* 28-Day Check-in Card */}
            {(() => {
                const anchor = profile?.last_thirty_day_checkin || profile?.subscription?.subscribedAt || (profile?.updatedAt?.toDate?.()?.toISOString?.()) || null;
                if (!anchor) return null;
                const elapsed = Date.now() - new Date(anchor).getTime();
                if (elapsed < CHECKIN_INTERVAL_MS) return null;
                if (elapsed > CHECKIN_WINDOW_MS) return null; // Auto-hide after 7-day window
                return (
                    <CheckInCard
                        characterTitle={profile?.identity?.title || t('idealSelfDefault')}
                        avatarUrl={profile?.character_bible?.compiled_output?.avatar_url}
                    />
                );
            })()}

            {pendingPostId && (
                <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative animate-pulse flex items-center justify-center p-8">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-zinc-300 animate-spin" />
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest inline-block text-center mt-2">
                            {t('writingPending')}
                        </span>
                    </div>
                </div>
            )}

            {/* Ground Rules Card — shown until first Mirror Chat session */}
            {!showBibleCompiling && !showBibleFailed && hasBuiltCharacter
                && (!profile?.identity?.session_count || profile.identity.session_count < 1) && (
                <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-5">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-1">Before your first session</p>
                        <p className="text-sm font-bold text-white mb-4">Ground Rules</p>
                        <div className="space-y-2.5">
                            {[
                                { icon: '✦', text: 'Be fully honest — say what you actually feel' },
                                { icon: '✦', text: "If you disagree, say so — you won't offend anyone" },
                                { icon: '✦', text: 'Commit to the full session — there is an end' },
                                { icon: '✦', text: 'Answer every question, even the hard ones' },
                                { icon: '✦', text: 'No one is listening. No one is judging you.' },
                            ].map((rule, i) => (
                                <div
                                    key={i}
                                    className="flex items-start gap-2.5 opacity-0 animate-[fadeInUp_0.4s_ease-out_forwards]"
                                    style={{ animationDelay: `${i * 0.3}s` }}
                                >
                                    <span className="text-white/40 text-xs mt-0.5 shrink-0">{rule.icon}</span>
                                    <p className="text-sm text-zinc-300 leading-snug">{rule.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Voice Selection — always show until user has confirmed a voice */}
            {user && !profile?.character_bible?.voice_confirmed && (
                <VoiceBrowser
                    currentVoiceId={profile?.character_bible?.voice_id}
                    currentVoiceName={profile?.character_bible?.voice_name}
                    startOpen
                    compact
                    onVoiceSelected={async () => {
                        try {
                            const { doc: firestoreDoc, updateDoc: firestoreUpdate } = await import('firebase/firestore');
                            await firestoreUpdate(firestoreDoc(db, 'users', user.uid), {
                                'character_bible.voice_confirmed': true,
                            });
                        } catch (err) {
                            console.error('Failed to confirm voice:', err);
                        }
                    }}
                />
            )}

            {/* Daily Digest Card — always first */}
            {profile?.daily_digest?.title && (
                <DigestCard
                    title={profile.daily_digest.title}
                    content={profile.daily_digest.full_content || profile.daily_digest.content}
                    imageUrl={profile.daily_digest.image_url}
                    audioUrl={profile.daily_digest.audio_url}
                />
            )}

            {entries.map((entry, index) => (
                <React.Fragment key={entry.id}>
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
                    <p className="text-xs text-zinc-600">{t('caughtUp')}</p>
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
