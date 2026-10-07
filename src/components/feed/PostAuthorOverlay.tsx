"use client";

import { useState } from "react";
import { User } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDistanceToNow } from "date-fns";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { timestampToDate } from "@/lib/posts/timestamps";
import type { Post, PostVisibility } from "@/types/post";

interface PostAuthorOverlayProps {
    post: Post;
    isFullscreen: boolean;
    /** Name to show: the viewer's alias for a followed author, else the pseudonym. */
    displayName: string;
    isAuthor: boolean;
    canFollow: boolean;
    onFollow: () => void;
    digestMode?: boolean;
}

/** Author avatar, name, follow button, age and (for the owner) the visibility picker. */
export function PostAuthorOverlay({ post, isFullscreen, displayName, isAuthor, canFollow, onFollow, digestMode }: PostAuthorOverlayProps) {
    const t = useTranslations('feed');
    const { user } = useAuth();
    const [localVisibility, setLocalVisibility] = useState<PostVisibility>(post.visibility || (post.is_public ? 'community' : 'private'));

    const createdAtDate = timestampToDate(post.created_at);
    const timeAgo = createdAtDate ? formatDistanceToNow(createdAtDate, { addSuffix: true }) : t('justNow');

    const handleVisibilityChange = async (value: PostVisibility) => {
        if (!user || user.uid !== post.uid) return;
        const prev = localVisibility;
        setLocalVisibility(value);
        try {
            await updateDoc(doc(db, "posts", post.id), {
                visibility: value,
                is_public: value !== 'private',
            });
        } catch (error) {
            console.error("Error changing visibility:", error);
            setLocalVisibility(prev); // revert on failure
        }
    };

    return (
        <div className={`absolute top-0 left-0 right-0 z-10 ${isFullscreen ? 'p-6' : 'p-3 sm:p-4'}`} style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.7))' }}>
            <div className="flex items-center gap-2.5">
                <div className={`rounded-full bg-zinc-800 border border-white/20 overflow-hidden flex items-center justify-center shrink-0 ${isFullscreen ? 'w-12 h-12' : 'w-8 h-8'}`}>
                    {post.author_avatar_url ? (
                        <img src={post.author_avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <User className={`text-zinc-400 ${isFullscreen ? 'w-6 h-6' : 'w-4 h-4'}`} />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`font-semibold text-white/90 truncate ${isFullscreen ? 'text-lg' : 'text-sm'}`}>
                            {isAuthor ? t('authorMe') : displayName || t('authorAnonymous')}
                        </span>
                        {canFollow && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onFollow(); }}
                                className={`font-bold text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 rounded transition-all tracking-wide shrink-0 ${isFullscreen ? 'text-sm px-3 py-1' : 'text-[10px] px-2 py-0.5'}`}
                            >
                                {t('followAuthor')}
                            </button>
                        )}
                    </div>
                    <span className={`text-white/50 ${isFullscreen ? 'text-sm' : 'text-[10px]'}`}>{timeAgo}</span>
                </div>
                {/* Visibility control */}
                {user?.uid === post.uid && !digestMode && (
                    <select
                        value={localVisibility}
                        onChange={(e) => { e.stopPropagation(); handleVisibilityChange(e.target.value as PostVisibility); }}
                        onClick={(e) => e.stopPropagation()}
                        className={`font-bold tracking-wide bg-black/50 backdrop-blur-sm border border-white/20 text-white/70 rounded-md focus:outline-none transition-all cursor-pointer appearance-none ${isFullscreen ? 'text-sm px-3 py-1.5' : 'text-[10px] px-1.5 py-1'}`}
                        style={{ backgroundImage: 'none' }}
                    >
                        <option value="private">🔒 {t('visibilityPrivate')}</option>
                        <option value="community">👥 {t('visibilityCommunity')}</option>
                        <option value="public">🌐 {t('visibilityPublic')}</option>
                    </select>
                )}
            </div>
        </div>
    );
}
