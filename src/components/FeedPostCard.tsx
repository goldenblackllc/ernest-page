"use client";

import { useState, useEffect, useCallback } from "react";
import { User, Clock, Trash2, Lock, ChevronDown, ChevronUp, Heart, RefreshCw, MessageCircle, ArrowUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCountryFlag } from "@/lib/regionFlag";
import { formatDistanceToNow } from "date-fns";
import { Timestamp, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';


interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface FeedPostProps {
    post: {
        id: string;
        uid: string;
        authorId?: string;
        type: 'checkin';
        post_type?: 'reality_shift';
        title?: string;
        pseudonym?: string;
        letter?: string;
        response?: string;
        tension?: string;
        counsel?: string;
        rant?: string;
        directive_title?: string;
        unexpected_yield?: string;
        conversation_messages?: ConversationMessage[];
        content_raw?: string;
        public_post?: {
            title?: string;
            pseudonym?: string;
            letter?: string;
            response?: string;
            imagen_url?: string;
        };
        imageUrl?: string;
        imagen_url?: string;
        sponsored_by?: string;
        sponsored_link?: string;
        region?: string;
        language?: string;
        created_at: Timestamp;
        is_public?: boolean;
        visibility?: 'private' | 'community' | 'public';
        isLikedByMe?: boolean;
        like_count?: number;
        author_avatar_url?: string;
        comments?: number;
        translations?: Record<string, any>;
        _translated?: Record<string, any>;
    };
    followingMap?: Record<string, string>;
    onFollowClick?: (authorId: string) => void;
    onRequestDelete?: (postId: string) => void;
}

export function FeedPostCard({ post, followingMap, onFollowClick, onRequestDelete }: FeedPostProps) {
    const [isResponseExpanded, setIsResponseExpanded] = useState(false);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [localVisibility, setLocalVisibility] = useState<'private' | 'community' | 'public'>(post.visibility || (post.is_public ? 'community' : 'private'));
    const t = useTranslations('feed');
    const locale = useLocale();

    const [translatedData, setTranslatedData] = useState<any>(post._translated || post.translations?.[locale] || null);


    // Sync auto-translation when batch translate results arrive via prop change
    useEffect(() => {
        if (post._translated) {
            setTranslatedData(post._translated);
        }
    }, [post._translated]);

    const { user } = useAuth();

    // Comment state
    const [isCommentOpen, setIsCommentOpen] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [commentToast, setCommentToast] = useState<string | null>(null);
    const [comments, setComments] = useState<any[]>([]);
    const [commentsLoaded, setCommentsLoaded] = useState(false);

    const fetchComments = useCallback(async () => {
        if (!user || commentsLoaded) return;
        try {
            const idToken = await user.getIdToken();
            const res = await fetch(`/api/posts/comments?postId=${post.id}`, {
                headers: { 'Authorization': `Bearer ${idToken}` },
            });
            if (res.ok) {
                const data = await res.json();
                setComments(data.comments || []);
            }
            setCommentsLoaded(true);
        } catch (err) {
            console.error('Failed to fetch comments:', err);
        }
    }, [user, post.id, commentsLoaded]);

    const handleToggleComments = () => {
        const newState = !isCommentOpen;
        setIsCommentOpen(newState);
        if (newState && !commentsLoaded) fetchComments();
    };

    // Auto-load comments if the post has them
    useEffect(() => {
        if ((post.comments && post.comments > 0) && !commentsLoaded) {
            fetchComments();
        }
    }, [post.comments, commentsLoaded, fetchComments]);

    const submitComment = async () => {
        if (!user || !commentText.trim() || isSubmittingComment) return;
        setIsSubmittingComment(true);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/posts/comment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({ postId: post.id, comment: commentText.trim() }),
            });
            if (res.ok) {
                const data = await res.json();
                // Add the personal comment locally with avatar from API
                setComments(prev => [{
                    id: Date.now().toString(),
                    content: commentText.trim(),
                    type: 'personal',
                    is_mine: true,
                    author_title: t('roleYou'),
                    author_avatar_url: data.author_avatar_url || null,
                    created_at: null,
                }, ...prev]);
                setCommentText('');
                setCommentToast(t('commentSaved'));
                setTimeout(() => setCommentToast(null), 4000);
            }
        } catch (err) {
            console.error('Failed to submit comment:', err);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const postAuthorId = post.authorId || post.uid;
    const isAuthor = user?.uid === postAuthorId;
    const hasPrivateData = Boolean(
        (post.conversation_messages && post.conversation_messages.length > 0) ||
        post.content_raw ||
        (post.rant && post.counsel)
    );

    const [localLiked, setLocalLiked] = useState<boolean>(post.isLikedByMe || (isAuthor && (post.like_count || 0) > 0));

    useEffect(() => {
        setLocalLiked(post.isLikedByMe || (isAuthor && (post.like_count || 0) > 0));
    }, [post.isLikedByMe, isAuthor, post.like_count]);

    // Following resolution
    const isFollowing = postAuthorId && followingMap && followingMap[postAuthorId];
    const customAlias = isFollowing ? followingMap[postAuthorId] : null;

    // Comment count: prefer loaded comments array, fallback to post field
    const commentCount = comments.length > 0 ? comments.length : (post.comments || 0);

    // Total likes: karma pool likes + viewer's own like
    const totalLikes = (post.like_count || 0) + (localLiked ? 1 : 0);

    // Public face content
    const publicLetter = post.public_post?.letter || post.letter || post.tension;
    const publicResponse = post.public_post?.response || post.response || post.counsel;
    const publicPseudonym = post.public_post?.pseudonym || post.pseudonym || "Anonymous";
    const publicTitle = translatedData?.title || post.public_post?.title || post.title;

    const timeAgo = post.created_at ? formatDistanceToNow(post.created_at.toDate(), { addSuffix: true }) : t('justNow');

    const handleDelete = () => onRequestDelete?.(post.id);

    const handleVisibilityChange = async (value: 'private' | 'community' | 'public') => {
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

    const toggleLike = async () => {
        if (!user) return;
        setLocalLiked(true);
        try {
            const idToken = await user.getIdToken();
            await fetch('/api/posts/like', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({ postId: post.id }),
            });
        } catch (error) {
            console.error("Error sending karma like:", error);
        }
    };



    // Reality Shift posts (must check BEFORE the letter/response null guard)
    if (post.post_type === 'reality_shift') {
        const shiftTimeAgo = post.created_at ? formatDistanceToNow(post.created_at.toDate(), { addSuffix: true }) : t('justNow');
        const yieldText = translatedData?.unexpected_yield || post.unexpected_yield || '';
        const isLongYield = yieldText.length > 280;

        return (
            <div className="bg-[#1a1a1a] border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative font-sans">
                {/* Subtle top accent */}
                <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                {/* ═══ Header — matching regular feed cards ═══ */}
                <div className="flex flex-row items-center gap-3 px-3 sm:px-4 py-3 sm:py-4 border-b border-white/5 bg-black/20 w-full">
                    <div className="shrink-0">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 overflow-hidden">
                            {post.author_avatar_url ? (
                                <img src={post.author_avatar_url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : null}
                            <User className={`w-5 h-5 text-zinc-400 ${post.author_avatar_url ? 'hidden' : ''}`} style={post.author_avatar_url ? { position: 'absolute' } : undefined} />
                        </div>
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex flex-row items-center gap-2 w-full">
                            <span className="text-sm font-semibold text-white truncate">
                                {isAuthor ? t('authorMe') : customAlias || publicPseudonym || t('authorAnonymous')}
                            </span>
                            <div className="shrink-0 flex items-center gap-2">
                                {!isAuthor && !customAlias && postAuthorId && onFollowClick && (
                                    <button
                                        onClick={() => onFollowClick(postAuthorId)}
                                        className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded transition-all tracking-wide"
                                    >
                                        {t('followAuthor')}
                                    </button>
                                )}
                                {user?.uid === post.uid && (
                                    <select
                                        value={localVisibility}
                                        onChange={(e) => handleVisibilityChange(e.target.value as 'private' | 'community' | 'public')}
                                        className="text-[10px] font-bold tracking-wide bg-zinc-900 border border-zinc-700 text-zinc-400 rounded-md px-1.5 py-1 focus:outline-none focus:border-zinc-500 transition-all cursor-pointer appearance-none"
                                        style={{ backgroundImage: 'none' }}
                                    >
                                        <option value="private">🔒 Only Me</option>
                                        <option value="community">👥 Community</option>
                                        <option value="public">🌐 Public</option>
                                    </select>
                                )}
                            </div>
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{shiftTimeAgo}</span>
                            {(post.region || post.language) && (
                                <>
                                    <span className="text-zinc-700">·</span>
                                    <span>{getCountryFlag(post.region)} {post.language || ''}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* ═══ Body ═══ */}
                <div className="p-0 flex flex-col">
                    <div className="px-3 sm:px-4 pt-4 pb-3 sm:pb-4">
                        <h2 className="text-base sm:text-lg font-bold text-white mb-1 sm:mb-2 leading-tight">
                            {t('realityShiftTitle')}
                        </h2>

                        <p className={cn(
                            "text-sm sm:text-[15px] text-zinc-200 leading-relaxed whitespace-pre-wrap",
                            !isExpanded && isLongYield && "line-clamp-4"
                        )}>
                            {yieldText}
                        </p>

                        {isLongYield && (
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="text-sm font-semibold text-zinc-400 hover:text-white mt-2 transition-colors duration-200"
                            >
                                {isExpanded ? t('showLess') : t('readMore')}
                            </button>
                        )}
                    </div>
                </div>

                {/* ═══ Footer ═══ */}
                <div className="px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleLike}
                            className={cn("flex items-center gap-1 transition-transform active:scale-75 hover:scale-110",
                                totalLikes >= 1 ? "text-red-500" : "text-zinc-500 hover:text-red-500/80"
                            )}
                        >
                            <Heart className={cn("w-5 h-5", totalLikes >= 1 && "fill-red-500")} />
                            {totalLikes > 1 && <span className="text-xs font-medium">{totalLikes}</span>}
                        </button>

                    </div>
                    {user?.uid === post.uid && (
                        <button
                            onClick={handleDelete}
                            className="text-zinc-400 hover:text-red-500 transition-colors duration-200 p-1"
                            title={t('deletePost')}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // For non–reality-shift posts, letter and response are required
    if (!publicLetter || !publicResponse) {
        return null;
    }

    const isLongPrivateCounsel = (post.counsel || '').length > 400;
    const displayedPrivateCounsel = isLongPrivateCounsel && !isResponseExpanded
        ? post.counsel?.slice(0, 400) + "..."
        : post.counsel;

    return (
        <div className="bg-[#1a1a1a] border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative group font-sans">
            {/* Header */}
            <div className="flex flex-row items-center gap-3 px-3 sm:px-4 py-3 sm:py-4 border-b border-white/5 bg-black/20 mb-2 w-full">
                <div className="shrink-0">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 overflow-hidden relative">
                        {post.author_avatar_url ? (
                            <img src={post.author_avatar_url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : null}
                        <User className={`w-5 h-5 text-zinc-400 ${post.author_avatar_url ? 'hidden' : ''}`} style={post.author_avatar_url ? { position: 'absolute' } : undefined} />
                    </div>
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex flex-row items-center gap-2 w-full">
                        <span className="text-sm font-semibold text-white truncate">
                            {isAuthor ? t('authorMe') : customAlias || publicPseudonym || t('authorAnonymous')}
                        </span>
                        <div className="shrink-0 flex items-center gap-2">
                            {!isAuthor && !customAlias && postAuthorId && onFollowClick && (
                                <button
                                    onClick={() => onFollowClick(postAuthorId)}
                                    className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded transition-all tracking-wide"
                                >
                                    {t('followAuthor')}
                                </button>
                            )}
                            {user?.uid === post.uid && (
                                    <select
                                        value={localVisibility}
                                        onChange={(e) => handleVisibilityChange(e.target.value as 'private' | 'community' | 'public')}
                                        className="text-[10px] font-bold tracking-wide bg-zinc-900 border border-zinc-700 text-zinc-400 rounded-md px-1.5 py-1 focus:outline-none focus:border-zinc-500 transition-all cursor-pointer appearance-none"
                                        style={{ backgroundImage: 'none' }}
                                    >
                                        <option value="private">🔒 Only Me</option>
                                        <option value="community">👥 Community</option>
                                        <option value="public">🌐 Public</option>
                                    </select>
                                )}
                        </div>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{timeAgo}</span>
                        {(post.region || post.language) && (
                            <>
                                <span className="text-zinc-700">·</span>
                                <span>{getCountryFlag(post.region)} {post.language || ''}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="p-0 flex flex-col pt-4">
                {/* 3D Perspective Container */}
                <div className="relative w-full [perspective:1000px] mb-4">
                    <div className={cn(
                        "relative w-full transition-transform duration-700 [transform-style:preserve-3d]",
                        isFlipped && "[transform:rotateY(180deg)]"
                    )}>

                        {/* --- FRONT FACE (Public Post) --- */}
                        <div className={cn(
                            "w-full top-0 left-0 [backface-visibility:hidden] transition-opacity duration-300",
                            isFlipped ? "absolute opacity-0 pointer-events-none" : "relative opacity-100"
                        )}>
                            {/* AI Generated Image */}
                            {(() => {
                                const displayUrl = post.public_post?.imagen_url || post.imagen_url;

                                if (!displayUrl) return null;

                                return (
                                    <div className="px-3 sm:px-4 mb-2">
                                        <div className="relative w-full aspect-[21/9] sm:aspect-video object-cover rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                                            <img
                                                src={displayUrl}
                                                alt={publicTitle || "Hero Object"}
                                                className="w-full h-full object-cover transition-all duration-500"
                                            />
                                        </div>
                                        {post.sponsored_by && (
                                            <a
                                                href={post.sponsored_link || '#'}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block text-[10px] text-zinc-500 uppercase tracking-widest mt-1.5 hover:text-zinc-400 transition-colors"
                                            >
                                                Sponsored by {post.sponsored_by}
                                            </a>
                                        )}
                                    </div>
                                );
                            })()}

                            {publicTitle && (
                                <div className="px-3 sm:px-4">
                                    <h2 className="text-base sm:text-lg font-bold text-white mb-1 sm:mb-2 leading-tight">
                                        {publicTitle}
                                    </h2>
                                </div>
                            )}

                            {post.imageUrl && (
                                <div className="px-3 sm:px-4 mb-2">
                                    <div className="relative w-full aspect-[21/9] sm:aspect-video object-cover rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                                        <Image
                                            src={post.imageUrl}
                                            alt={publicTitle || "Post Image"}
                                            fill
                                            className={cn(
                                                "object-cover transition-all duration-500",
                                                !isAuthor ? "blur-3xl scale-110 opacity-80" : ""
                                            )}
                                        />
                                        {!isAuthor && (
                                            <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-md rounded-full p-1.5 shadow-lg border border-white/10 z-10" title="Image obscured for privacy">
                                                <Lock className="w-3.5 h-3.5 text-zinc-400" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Public Letter & Response — Q&A Layout */}
                            <div className={cn("px-3 sm:px-4 pb-3 sm:pb-4 mt-1", !isExpanded && "mb-2")}>
                                {/* Letter Block (The User's Tension) */}
                                {(() => {
                                    const sourceLetter = translatedData?.letter || publicLetter || '';
                                    const lines = sourceLetter.split('\n');
                                    const firstLine = lines[0]?.trim() || '';
                                    const hasGreeting = /^dear\s/i.test(firstLine);
                                    const greeting = hasGreeting ? firstLine : null;
                                    const body = hasGreeting ? lines.slice(1).join('\n').trimStart() : publicLetter;
                                    return (
                                        <div className="mb-4">
                                            {greeting && (
                                                <p className="text-sm sm:text-[15px] italic text-zinc-400 whitespace-pre-wrap leading-relaxed mb-1">
                                                    {greeting}
                                                </p>
                                            )}
                                            <p className={cn(
                                                "text-sm sm:text-[15px] not-italic leading-relaxed text-zinc-300 whitespace-pre-wrap",
                                                !isExpanded && "line-clamp-3"
                                            )}>
                                                {body}
                                            </p>
                                        </div>
                                    );
                                })()}

                                {!isExpanded ? (
                                    <button
                                        onClick={() => setIsExpanded(true)}
                                        className="text-sm font-semibold text-zinc-400 hover:text-white mt-1 transition-colors duration-200"
                                    >
                                        {t('readMore')}
                                    </button>
                                ) : (
                                    <>



                                        {/* Response Block (The Ideal Self's Advice) */}
                                        <div className="text-zinc-100 not-italic text-sm sm:text-[15px] leading-relaxed [&_strong]:font-bold [&_strong]:text-white [&_em]:italic [&>p]:mb-4 [&>p:last-child]:mb-0">
                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{(translatedData?.response || publicResponse || '').replace(/^THE COUNSEL:\s*/i, '')}</ReactMarkdown>
                                        </div>

                                        <button
                                            onClick={() => setIsExpanded(false)}
                                            className="text-sm font-semibold text-zinc-400 hover:text-white mt-3 transition-colors duration-200"
                                        >
                                            {t('showLess')}
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* --- BACK FACE (Private Vault — Conversation Transcript) --- */}
                        {isAuthor && hasPrivateData && (
                            <div className={cn(
                                "w-full top-0 left-0 [backface-visibility:hidden] [transform:rotateY(180deg)] transition-opacity duration-300 px-3 sm:px-4",
                                !isFlipped ? "absolute opacity-0 pointer-events-none" : "relative opacity-100"
                            )}>
                                <div className="bg-zinc-950 border border-emerald-900/30 rounded-xl p-3 sm:p-5 shadow-inner">
                                    <div className="flex items-center gap-2 mb-4 border-b border-emerald-900/30 pb-3">
                                        <Lock className="w-4 h-4 text-emerald-500" />
                                        <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-widest">
                                            {post.conversation_messages ? t('rawConversation') : t('rawInputCounsel')}
                                        </h3>
                                    </div>

                                    {/* Conversation Transcript (new - array format) */}
                                    {post.conversation_messages && post.conversation_messages.length > 0 ? (
                                        <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                                            {post.conversation_messages.map((msg, idx) => (
                                                <div
                                                    key={idx}
                                                    className={cn(
                                                        "text-sm whitespace-pre-wrap leading-snug p-3 rounded-lg",
                                                        msg.role === 'user'
                                                            ? "bg-black/40 border border-white/5 text-zinc-400 italic"
                                                            : "bg-emerald-950/30 border border-emerald-900/20 text-zinc-200"
                                                    )}
                                                >
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 block mb-1">
                                                        {msg.role === 'user' ? t('roleYou') : t('roleCharacter')}
                                                    </span>
                                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                                        {msg.content}
                                                    </ReactMarkdown>
                                                </div>
                                            ))}
                                        </div>
                                    ) : post.content_raw ? (
                                        /* Conversation transcript (string format from cron) */
                                        <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                                            {post.content_raw.split('\n').filter(line => line.trim()).map((line, idx) => {
                                                const isUser = line.startsWith('user:');
                                                const content = line.replace(/^(user|assistant):\s*/i, '');
                                                return (
                                                    <div
                                                        key={idx}
                                                        className={cn(
                                                            "text-sm whitespace-pre-wrap leading-snug p-3 rounded-lg",
                                                            isUser
                                                                ? "bg-black/40 border border-white/5 text-zinc-400 italic"
                                                                : "bg-emerald-950/30 border border-emerald-900/20 text-zinc-200"
                                                        )}
                                                    >
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 block mb-1">
                                                            {isUser ? t('roleYou') : t('roleCharacter')}
                                                        </span>
                                                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                                            {content}
                                                        </ReactMarkdown>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <>
                                            {/* Legacy: Raw Rant + Counsel */}
                                            {post.rant && (
                                                <div className="mb-6">
                                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{t('rawInputTitle')}</h4>
                                                    <p className="text-sm italic text-zinc-400 whitespace-pre-wrap leading-snug p-3 bg-black/40 rounded-lg border border-white/5">
                                                        {post.rant}
                                                    </p>
                                                </div>
                                            )}
                                            {post.counsel && (
                                                <div>
                                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{t('rawCounselTitle')}</h4>
                                                    <div className="text-zinc-200 whitespace-pre-wrap text-sm sm:text-[15px] leading-snug [&_strong]:font-bold [&_strong]:text-white [&_em]:italic [&>p]:mb-3 [&>p:last-child]:mb-0">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{displayedPrivateCounsel || ""}</ReactMarkdown>
                                                    </div>
                                                    {isLongPrivateCounsel && (
                                                        <button
                                                            onClick={() => setIsResponseExpanded(!isResponseExpanded)}
                                                            className="mt-4 text-[10px] font-bold uppercase tracking-widest text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
                                                        >
                                                            {isResponseExpanded ? (
                                                                <>{t('showLess')} <ChevronUp className="w-3 h-3" /></>
                                                            ) : (
                                                                <>{t('readMore')} <ChevronDown className="w-3 h-3" /></>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                    </div>
                </div>

                {/* Bottom Action Bar */}
                <div className="px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleLike}
                            className={cn("flex items-center gap-1 transition-transform active:scale-75 hover:scale-110",
                                totalLikes >= 1 ? "text-red-500" : "text-zinc-500 hover:text-red-500/80"
                            )}
                            title={t('likeTooltip')}
                        >
                            <Heart className={cn("w-5 h-5", totalLikes >= 1 && "fill-red-500")} />
                            {totalLikes > 1 && (
                                <span className="text-xs font-medium">
                                    {totalLikes}
                                </span>
                            )}
                        </button>

                        <button
                            onClick={handleToggleComments}
                            className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors active:scale-75 hover:scale-110"
                            title={t('commentTooltip')}
                        >
                            <MessageCircle className={cn("w-5 h-5", commentCount >= 1 && "fill-zinc-400")} />
                            {commentCount > 1 && (
                                <span className="text-xs font-medium">
                                    {commentCount}
                                </span>
                            )}
                        </button>

                        {/* Flip Toggle */}
                        {isAuthor && hasPrivateData && (
                            <button
                                onClick={() => {
                                    setIsFlipped(!isFlipped);
                                    setIsResponseExpanded(false);
                                }}
                                className={cn(
                                    "flex items-center gap-1.5 transition-colors duration-200 group ml-2",
                                    isFlipped ? "text-white" : "text-zinc-400 hover:text-white"
                                )}
                                title={isFlipped ? t('viewPublic') : t('viewPrivate')}
                            >
                                <RefreshCw className={cn("w-4 h-4 transition-transform duration-500", isFlipped && "rotate-180")} />
                                <span className="text-zinc-400 text-sm hidden sm:inline">{isFlipped ? t('viewPublic') : t('viewPrivate')}</span>
                            </button>
                        )}
                        

                    </div>

                    {user?.uid === post.uid && (
                        <button
                            onClick={handleDelete}
                            className="text-zinc-400 hover:text-white transition-colors duration-200 p-1"
                            title={t('deletePost')}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Comment section */}
                {isCommentOpen && (
                    <div className="px-3 sm:px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                        {/* Comment toast */}
                        {commentToast && (
                            <div className="text-xs text-zinc-300 bg-zinc-800/60 border border-zinc-700/40 rounded-lg px-3 py-2">
                                {commentToast}
                            </div>
                        )}

                        {/* Comment input */}
                        <div className="relative bg-zinc-900/50 border border-zinc-800 rounded-full flex items-center px-4 py-2">
                            <input
                                type="text"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                                placeholder={t('commentPlaceholder')}
                                className="bg-transparent border-none focus:ring-0 focus:outline-none text-white placeholder-zinc-500 w-full pr-10 text-sm"
                                disabled={isSubmittingComment}
                            />
                            <button
                                onClick={submitComment}
                                disabled={!commentText.trim() || isSubmittingComment}
                                className={cn(
                                    "absolute right-3 transition-all duration-200",
                                    commentText.trim()
                                        ? "text-white cursor-pointer hover:scale-105"
                                        : "text-zinc-600 cursor-default"
                                )}
                            >
                                <ArrowUp className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Comments list */}
                        {comments.length > 0 && (
                            <div className="space-y-3 pt-1">
                                {comments.map((c: any) => (
                                    <div key={c.id} className="flex items-start gap-2.5">
                                        <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 mt-0.5">
                                            {c.author_avatar_url ? (
                                                <img src={c.author_avatar_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <User className="w-3.5 h-3.5 text-zinc-500" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="text-xs font-semibold text-zinc-400">
                                                {c.is_mine ? t('roleYou') : c.author_title}
                                            </span>
                                            <p className="text-sm text-zinc-300 leading-relaxed mt-0.5">{c.content}</p>
                                        </div>
                                        {c.is_mine && (
                                            <button
                                                onClick={async () => {
                                                    if (!user) return;
                                                    setComments(prev => prev.filter(x => x.id !== c.id));
                                                    try {
                                                        const idToken = await user.getIdToken();
                                                        await fetch('/api/posts/comment/delete', {
                                                            method: 'POST',
                                                            headers: {
                                                                'Content-Type': 'application/json',
                                                                'Authorization': `Bearer ${idToken}`,
                                                            },
                                                            body: JSON.stringify({ postId: post.id, commentId: c.id }),
                                                        });
                                                    } catch (err) {
                                                        console.error('Failed to delete comment:', err);
                                                    }
                                                }}
                                                className="shrink-0 p-1 text-zinc-600 hover:text-red-500 transition-colors mt-0.5"
                                                title={t('deleteComment')}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>


        </div>
    );
}
