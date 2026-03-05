"use client";

import { useState, useEffect, useCallback } from "react";
import { User, Clock, Trash2, Globe, Lock, ChevronDown, ChevronUp, Heart, RefreshCw, MessageCircle, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Timestamp, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { useAuth } from "@/lib/auth/AuthContext";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import Image from 'next/image';

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
        title?: string;
        pseudonym?: string;
        letter?: string;
        response?: string;
        tension?: string;
        counsel?: string;
        rant?: string;
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
        created_at: Timestamp;
        is_public?: boolean;
        isLikedByMe?: boolean;
        like_count?: number;
        author_avatar_url?: string;
        comments?: number;
    };
    followingMap?: Record<string, string>;
    onFollowClick?: (authorId: string) => void;
}

export function FeedPostCard({ post, followingMap, onFollowClick }: FeedPostProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isResponseExpanded, setIsResponseExpanded] = useState(false);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

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
                    author_title: 'You',
                    author_avatar_url: data.author_avatar_url || null,
                    created_at: null,
                }, ...prev]);
                setCommentText('');
                setCommentToast('Saved. Your character also left a note on another post ✨');
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

    // Public face content
    const publicLetter = post.public_post?.letter || post.letter || post.tension;
    const publicResponse = post.public_post?.response || post.response || post.counsel;
    const publicPseudonym = post.public_post?.pseudonym || post.pseudonym || "Anonymous";
    const publicTitle = post.public_post?.title || post.title;

    if (!publicLetter || !publicResponse) {
        return null;
    }

    const timeAgo = post.created_at ? formatDistanceToNow(post.created_at.toDate(), { addSuffix: true }) : "just now";

    const handleDelete = () => setIsConfirmingDelete(true);

    const confirmDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteDoc(doc(db, "posts", post.id));
        } catch (error) {
            console.error("Error deleting post:", error);
            setIsDeleting(false);
        }
    };

    const togglePrivacy = async () => {
        if (!user || user.uid !== post.uid) return;
        const newStatus = !post.is_public;
        try {
            await updateDoc(doc(db, "posts", post.id), { is_public: newStatus });
        } catch (error) {
            console.error("Error toggling privacy:", error);
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
            });
        } catch (error) {
            console.error("Error sending karma like:", error);
        }
    };



    if (isDeleting) return null;

    const isLongPrivateCounsel = (post.counsel || '').length > 400;
    const displayedPrivateCounsel = isLongPrivateCounsel && !isResponseExpanded
        ? post.counsel?.slice(0, 400) + "..."
        : post.counsel;

    return (
        <div className="bg-[#1a1a1a] border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative group font-sans">
            {/* Header */}
            <div className="flex flex-row items-center gap-3 px-3 sm:px-4 py-3 sm:py-4 border-b border-white/5 bg-black/20 mb-2 w-full">
                <div className="shrink-0">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 overflow-hidden">
                        {post.author_avatar_url ? (
                            <img src={post.author_avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <User className="w-5 h-5 text-emerald-500" />
                        )}
                    </div>
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex flex-row items-center gap-2 w-full">
                        <span className="text-sm font-semibold text-white truncate">
                            {isAuthor ? "Me" : customAlias ? `Counsel from ${customAlias}` : "Dear Earnest"}
                        </span>
                        <div className="shrink-0 flex items-center gap-2">
                            {!isAuthor && !customAlias && postAuthorId && onFollowClick && (
                                <button
                                    onClick={() => onFollowClick(postAuthorId)}
                                    className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded transition-all tracking-wide"
                                >
                                    + Follow Author
                                </button>
                            )}
                            {user?.uid === post.uid && (
                                <button
                                    onClick={togglePrivacy}
                                    className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide hover:bg-white/5 py-1 px-1.5 rounded-md transition-all group/privacy"
                                >
                                    {post.is_public ? (
                                        <>
                                            <Globe className="w-3 h-3 text-blue-400" />
                                            <span className="text-blue-400">Everyone</span>
                                        </>
                                    ) : (
                                        <>
                                            <Lock className="w-3 h-3 text-zinc-500" />
                                            <span className="text-zinc-500">Only Me</span>
                                        </>
                                    )}
                                    <ChevronDown className="w-3 h-3 text-zinc-600 group-hover/privacy:text-zinc-400" />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{timeAgo}</span>
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

                            {/* Public Letter & Response */}
                            <div className={cn("px-3 sm:px-4 pb-3 sm:pb-4 mt-1", !isExpanded && "mb-2")}>
                                <p className={cn(
                                    "text-sm sm:text-[15px] italic text-zinc-300 whitespace-pre-wrap leading-snug",
                                    !isExpanded && "line-clamp-6"
                                )}>
                                    {publicLetter}
                                </p>

                                {!isExpanded ? (
                                    <button
                                        onClick={() => setIsExpanded(true)}
                                        className="text-sm font-semibold text-zinc-400 hover:text-white mt-1 transition-colors"
                                    >
                                        Read the Counsel ⌄
                                    </button>
                                ) : (
                                    <>
                                        <div className="mt-2 text-zinc-100 whitespace-pre-wrap text-sm sm:text-[15px] leading-snug opacity-100 transition-all [&_strong]:font-bold [&_strong]:text-white [&_em]:italic [&>p]:mb-3 [&>p:last-child]:mb-0">
                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{publicResponse}</ReactMarkdown>
                                        </div>
                                        <button
                                            onClick={() => setIsExpanded(false)}
                                            className="text-sm font-semibold text-zinc-400 hover:text-white mt-1 transition-colors"
                                        >
                                            Show Less ⌃
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
                                            {post.conversation_messages ? 'Raw Conversation' : 'Raw Input & Counsel'}
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
                                                        {msg.role === 'user' ? 'You' : 'Character'}
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
                                                            {isUser ? 'You' : 'Character'}
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
                                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">My Raw Input</h4>
                                                    <p className="text-sm italic text-zinc-400 whitespace-pre-wrap leading-snug p-3 bg-black/40 rounded-lg border border-white/5">
                                                        {post.rant}
                                                    </p>
                                                </div>
                                            )}
                                            {post.counsel && (
                                                <div>
                                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Raw AI Counsel</h4>
                                                    <div className="text-zinc-200 whitespace-pre-wrap text-sm sm:text-[15px] leading-snug [&_strong]:font-bold [&_strong]:text-white [&_em]:italic [&>p]:mb-3 [&>p:last-child]:mb-0">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{displayedPrivateCounsel || ""}</ReactMarkdown>
                                                    </div>
                                                    {isLongPrivateCounsel && (
                                                        <button
                                                            onClick={() => setIsResponseExpanded(!isResponseExpanded)}
                                                            className="mt-4 text-[10px] font-bold uppercase tracking-widest text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
                                                        >
                                                            {isResponseExpanded ? (
                                                                <>Read Less <ChevronUp className="w-3 h-3" /></>
                                                            ) : (
                                                                <>Read More <ChevronDown className="w-3 h-3" /></>
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
                            className={cn("transition-transform active:scale-75 hover:scale-110",
                                localLiked ? "text-red-500" : "text-zinc-500 hover:text-red-500/80"
                            )}
                            title="Send love to the universe"
                        >
                            <Heart className={cn("w-5 h-5", localLiked && "fill-red-500")} />
                        </button>

                        <button
                            onClick={handleToggleComments}
                            className={cn("flex items-center gap-1 transition-transform active:scale-75 hover:scale-110",
                                isCommentOpen ? "text-emerald-500" : "text-zinc-500 hover:text-emerald-500/80"
                            )}
                            title="Comment"
                        >
                            <MessageCircle className="w-5 h-5" />
                            {(comments.length > 0 || (post.comments && post.comments > 0)) && (
                                <span className="text-xs font-medium">
                                    {comments.length || post.comments}
                                </span>
                            )}
                        </button>

                        {/* Like count — only visible to the post author */}
                        {isAuthor && post.like_count && post.like_count > 0 && (
                            <span className="text-xs text-zinc-500 font-medium -ml-2">
                                {post.like_count} {post.like_count === 1 ? 'person resonated' : 'people resonated'}
                            </span>
                        )}



                        {/* Flip Toggle */}
                        {isAuthor && hasPrivateData && (
                            <button
                                onClick={() => {
                                    setIsFlipped(!isFlipped);
                                    setIsResponseExpanded(false);
                                }}
                                className={cn(
                                    "flex items-center gap-1.5 transition-colors group ml-2",
                                    isFlipped ? "text-emerald-500" : "text-zinc-500 hover:text-white"
                                )}
                                title={isFlipped ? "View Public" : "View Private"}
                            >
                                <RefreshCw className={cn("w-4 h-4 transition-transform duration-500", isFlipped && "rotate-180")} />
                                <span className="text-xs font-medium">{isFlipped ? "View Public" : "View Private"}</span>
                            </button>
                        )}
                    </div>

                    {user?.uid === post.uid && (
                        <button
                            onClick={handleDelete}
                            className="text-zinc-500 hover:text-red-500 transition-colors p-1"
                            title="Delete Post"
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
                            <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                                {commentToast}
                            </div>
                        )}

                        {/* Comment input */}
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && submitComment()}
                                placeholder="Share your thoughts — your character will leave a note on another post too"
                                className="flex-1 bg-zinc-900 border border-zinc-700/50 rounded-full px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none"
                                disabled={isSubmittingComment}
                            />
                            <button
                                onClick={submitComment}
                                disabled={!commentText.trim() || isSubmittingComment}
                                className="p-2.5 bg-emerald-500 text-black rounded-full disabled:opacity-30 hover:bg-emerald-400 transition-colors shrink-0"
                            >
                                <Send className="w-4 h-4" />
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
                                                {c.is_mine ? 'You' : c.author_title}
                                            </span>
                                            <p className="text-sm text-zinc-300 leading-relaxed mt-0.5">{c.content}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <DeleteConfirmationModal
                isOpen={isConfirmingDelete}
                onClose={() => setIsConfirmingDelete(false)}
                onConfirm={confirmDelete}
            />
        </div>
    );
}
