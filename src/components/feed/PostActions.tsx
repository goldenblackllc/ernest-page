"use client";

import { useState, useCallback, useRef } from "react";
import { Trash2, Heart, RefreshCw, RotateCcw, MessageCircle, Share2, Loader2, FileText, ImagePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/auth/authFetch";
import { cn } from "@/lib/utils/cn";
import type { Post } from "@/types/post";
import type { FeedAudio } from "@/hooks/useFeedAudio";
import { VideoDownloadButton } from "./VideoDownloadButton";

function openAuthModal() {
    window.dispatchEvent(new CustomEvent('open-auth-modal'));
}

/** Dev-only: regenerates the whole post (letter, response, audio, image) and reloads. */
function DevRegenerateButton({ postId, className }: { postId: string; className: string }) {
    const [isRegeneratingPost, setIsRegeneratingPost] = useState(false);
    const [regenToast, setRegenToast] = useState<string | null>(null);

    const regenerate = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isRegeneratingPost) return;
        setIsRegeneratingPost(true);
        setRegenToast(null);
        try {
            await httpsCallable(functions, 'regeneratePost', { timeout: 540_000 })({ postId });
            setRegenToast('✓ Regenerated');
            setTimeout(() => window.location.reload(), 1500);
        } catch (err) {
            setRegenToast((err as Error | null)?.message || 'Failed');
        } finally {
            setIsRegeneratingPost(false);
            setTimeout(() => setRegenToast(null), 3000);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={regenerate}
                className={cn(className, isRegeneratingPost ? "text-amber-400" : "text-zinc-400 hover:text-amber-400")}
                title="Regenerate post (letter, response, audio, image)"
                disabled={isRegeneratingPost}
            >
                {isRegeneratingPost ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <ImagePlus className="w-4 h-4" />
                )}
            </button>
            {regenToast && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-zinc-800 text-white px-2 py-1 rounded whitespace-nowrap z-50">{regenToast}</span>
            )}
        </div>
    );
}

/** Share: the author gets an unlisted /s/:token link, everyone else /post/:id. */
function ShareButton({ post }: { post: Post }) {
    const t = useTranslations('feed');
    const { user } = useAuth();
    const [shareToast, setShareToast] = useState(false);
    const shareTokenRef = useRef<string | null>(post.shareToken || null);

    const handleShare = useCallback(async () => {
        const postAuthor = post.authorId || post.uid;
        const isOwner = user?.uid === postAuthor;

        let url: string;

        if (isOwner) {
            // Author flow: generate or reuse a share token
            if (shareTokenRef.current) {
                url = `${window.location.origin}/s/${shareTokenRef.current}`;
            } else {
                try {
                    const res = await authFetch(user!, '/api/share', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ postId: post.id }),
                    });
                    if (!res.ok) throw new Error('Failed to generate share link');
                    const data = await res.json();
                    shareTokenRef.current = data.shareToken;
                    url = `${window.location.origin}/s/${data.shareToken}`;
                } catch {
                    // Fallback to regular post link
                    url = `${window.location.origin}/post/${post.id}`;
                }
            }
        } else {
            url = `${window.location.origin}/post/${post.id}`;
        }

        try {
            if (navigator.share) {
                await navigator.share({ title: 'Earnest Page', url });
            } else {
                await navigator.clipboard.writeText(url);
                setShareToast(true);
                setTimeout(() => setShareToast(false), 2000);
            }
        } catch { /* user cancelled share sheet */ }
    }, [post.id, post.authorId, post.uid, user]);

    return (
        <button
            onClick={handleShare}
            className="text-zinc-400 hover:text-white transition-colors relative"
            title="Share"
        >
            <Share2 className="w-4 h-4" />
            {shareToast && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-zinc-800 text-white px-2 py-1 rounded whitespace-nowrap">{t('linkCopied')}</span>
            )}
        </button>
    );
}

interface PostActionsProps {
    post: Post;
    audio: FeedAudio;
    isAuthor: boolean;
    /** The author's original chat exists, so the Chat toggle can show. */
    hasPrivateChat: boolean;
    /** MP4 export needs at least one image. */
    hasImage: boolean;
    digestMode?: boolean;
    isTextView: boolean;
    onToggleTextView: () => void;
    isChatOpen: boolean;
    onToggleChat: () => void;
    onToggleComments: () => void;
    onRequestDelete?: (postId: string) => void;
}

/** Card footer: like, comments, restart | text and chat toggles | download, regenerate, delete, share. */
export function PostActions({
    post, audio, isAuthor, hasPrivateChat, hasImage, digestMode,
    isTextView, onToggleTextView, isChatOpen, onToggleChat, onToggleComments, onRequestDelete,
}: PostActionsProps) {
    const t = useTranslations('feed');
    const { user } = useAuth();

    // Dev-only features (regenerate button) — hidden on production
    const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const isOwner = user?.uid === post.uid;

    const serverLiked = Boolean(post.isLikedByMe || (isAuthor && (post.like_count || 0) > 0));
    const [localLiked, setLocalLiked] = useState<boolean>(serverLiked);

    // Reset the optimistic like whenever the server-side inputs change (adjusting state during render)
    const likeInputs = `${post.isLikedByMe}|${isAuthor}|${post.like_count}`;
    const [prevLikeInputs, setPrevLikeInputs] = useState(likeInputs);
    if (likeInputs !== prevLikeInputs) {
        setPrevLikeInputs(likeInputs);
        setLocalLiked(serverLiked);
    }

    // Total likes: karma pool likes + viewer's own like
    const totalLikes = (post.like_count || 0) + (localLiked ? 1 : 0);

    const toggleLike = async () => {
        if (!user) {
            openAuthModal();
            return;
        }
        setLocalLiked(true);
        try {
            await authFetch(user, '/api/posts/like', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postId: post.id }),
            });
        } catch (error) {
            console.error("Error sending karma like:", error);
        }
    };

    return (
        <div className="flex items-center px-4 py-2.5 bg-black/60 border-t border-zinc-700 gap-3">
            {/* Left: social actions */}
            <div className="flex items-center gap-4 flex-1">
                {!digestMode && (
                    <button
                        onClick={toggleLike}
                        className={cn(
                            "flex items-center gap-1.5 transition-all duration-200",
                            localLiked ? "text-red-500" : "text-zinc-400 hover:text-white"
                        )}
                    >
                        <Heart className={cn("w-5 h-5", localLiked && "fill-current")} />
                        {totalLikes > 0 && (
                            <span className="text-xs font-medium">{totalLikes}</span>
                        )}
                    </button>
                )}
                {!digestMode && (
                    <button
                        onClick={onToggleComments}
                        className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors"
                    >
                        <MessageCircle className="w-5 h-5" />
                        {post.comments && post.comments > 0 && (
                            <span className="text-xs font-medium">{post.comments}</span>
                        )}
                    </button>
                )}
                {/* Restart — shown once audio has started */}
                {audio.audioPhase !== 'idle' && (
                    <button
                        onClick={audio.restart}
                        className="text-zinc-400 hover:text-white transition-colors"
                        title="Restart"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Center: view mode toggles */}
            <div className="flex items-center gap-1.5">
                {/* Text toggle — visible to all users */}
                <button
                    onClick={onToggleTextView}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-200",
                        isTextView
                            ? "bg-white/10 border-white/30 text-white"
                            : "bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
                    )}
                >
                    <FileText className="w-3.5 h-3.5" />
                    {isTextView ? t('viewShort') : t('viewText')}
                </button>

                {/* Chat toggle — author only */}
                {isAuthor && hasPrivateChat && (
                    <button
                        onClick={onToggleChat}
                        className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-200",
                            isChatOpen
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : "bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
                        )}
                    >
                        <RefreshCw className={cn("w-3.5 h-3.5 transition-transform duration-500", isChatOpen && "rotate-180")} />
                        {isChatOpen ? t('viewPost') : t('viewChat')}
                    </button>
                )}
            </div>

            {/* Right: download + delete + share */}
            <div className="flex items-center gap-2">
                {/* MP4 Video Download — author only */}
                {isAuthor && hasImage && !digestMode && (
                    <VideoDownloadButton postId={post.id} thumbnailUrl={post.thumbnail_url} />
                )}

                {isDev && isOwner && !digestMode && (
                    <DevRegenerateButton postId={post.id} className="transition-colors relative" />
                )}
                {isOwner && !digestMode && (
                    <button onClick={() => onRequestDelete?.(post.id)} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
                {!digestMode && <ShareButton post={post} />}
            </div>
        </div>
    );
}
