import { useState } from "react";
import { User, Clock, Trash2, Globe, Lock, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Timestamp, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { useAuth } from "@/lib/auth/AuthContext";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface CheckInPostProps {
    post: {
        id: string;
        uid: string; // Original creator uid
        authorId?: string; // New Tracking id
        type: 'checkin';
        title?: string;
        pseudonym?: string; // New Dear Earnest Schema
        letter?: string;    // New Dear Earnest Schema
        response?: string;  // New Dear Earnest Schema
        tension?: string;   // Legacy Support
        counsel?: string;   // Legacy Support
        rant?: string;      // Raw User Input
        public_post?: {     // Strict Top-Level Schema
            title?: string;
            pseudonym?: string;
            letter?: string;
            response?: string;
        };
        created_at: Timestamp;
        is_public?: boolean;
    };
    followingMap?: Record<string, string>;
    onFollowClick?: (authorId: string) => void;
}

export function CheckInPostCard({ post, followingMap, onFollowClick }: CheckInPostProps) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isResponseExpanded, setIsResponseExpanded] = useState(false);
    const [showPrivate, setShowPrivate] = useState(false);
    const { user } = useAuth();

    const postAuthorId = post.authorId || post.uid;
    const isAuthor = user?.uid === postAuthorId;
    const hasPrivateData = Boolean(post.rant && post.counsel);

    // Following resolution
    const isFollowing = postAuthorId && followingMap && followingMap[postAuthorId];
    const customAlias = isFollowing ? followingMap[postAuthorId] : null;

    // Context-Aware Content Resolution
    const currentLetter = (showPrivate && isAuthor) ? post.rant : (post.public_post?.letter || post.letter || post.tension);
    const currentResponse = (showPrivate && isAuthor) ? post.counsel : (post.public_post?.response || post.response || post.counsel);
    const currentPseudonym = (showPrivate && isAuthor) ? "My Tension" : (post.public_post?.pseudonym || post.pseudonym || "Anonymous");
    const currentTitle = (showPrivate && isAuthor) ? "My True Feelings" : (post.public_post?.title || post.title);

    if (!currentLetter || !currentResponse) {
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
            await updateDoc(doc(db, "posts", post.id), {
                is_public: newStatus
            });
        } catch (error) {
            console.error("Error toggling privacy:", error);
        }
    };

    if (isDeleting) return null; // Optimistic hide

    const isLongResponse = currentResponse.length > 400;
    const displayedResponse = isLongResponse && !isResponseExpanded
        ? currentResponse.slice(0, 400) + "..."
        : currentResponse;

    return (
        <div className="bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative group font-sans">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-white/5 bg-black/20 w-full mb-4">
                {/* Left Section (Avatar + Info) */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
                        <User className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-200 truncate">
                                {isAuthor ? "Me" : customAlias ? `Counsel from ${customAlias}` : "Dear Earnest"}
                            </span>
                            {!isAuthor && !customAlias && postAuthorId && onFollowClick && (
                                <button
                                    onClick={() => onFollowClick(postAuthorId)}
                                    className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded transition-all tracking-wide shrink-0"
                                >
                                    + Follow Author
                                </button>
                            )}
                            {/* Audience Badge */}
                            {user?.uid === post.uid && (
                                <button
                                    onClick={togglePrivacy}
                                    className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide hover:bg-white/5 px-1.5 py-1 rounded-md transition-all group/privacy shrink-0"
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
                        <div className="text-xs text-zinc-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{timeAgo}</span>
                        </div>
                    </div>
                </div>

                {/* Right Section (Badge + Delete) */}
                <div className="flex items-center gap-3 shrink-0">
                    <div className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border border-emerald-900/50 text-emerald-500 bg-emerald-900/10">
                        Dear Earnest
                    </div>
                    {/* Delete Button */}
                    {user?.uid === post.uid && (
                        <button
                            onClick={handleDelete}
                            className="text-zinc-500 hover:text-red-500 transition-colors z-10 max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1"
                            title="Delete Post"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="p-0 flex flex-col pt-4">

                {/* Public/Private Toggle (Author Only) */}
                {isAuthor && hasPrivateData && (
                    <div className="flex justify-center mb-4 mx-6">
                        <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                            <button
                                onClick={() => setShowPrivate(false)}
                                className={cn(
                                    "px-4 py-1.5 rounded-md text-xs font-bold transition-all",
                                    !showPrivate ? "bg-zinc-700 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                Public
                            </button>
                            <button
                                onClick={() => setShowPrivate(true)}
                                className={cn(
                                    "px-4 py-1.5 rounded-md text-xs font-bold transition-all",
                                    showPrivate ? "bg-zinc-700 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                Private
                            </button>
                        </div>
                    </div>
                )}

                {/* The Title */}
                {!showPrivate && currentTitle && (
                    <div className="px-6">
                        <h2 className="text-xl font-bold text-white mb-2 leading-tight">
                            {currentTitle}
                        </h2>
                    </div>
                )}

                {/* The Letter (The Submission - Quoted Style) */}
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 mb-4 mx-6">
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {currentLetter}
                    </p>
                    <p className="mt-3 text-xs font-bold text-zinc-500 tracking-wide uppercase">
                        {showPrivate ? currentPseudonym : `- ${currentPseudonym}`}
                    </p>
                </div>

                {/* The Response (The Advice) */}
                <div className="px-6 pb-6">
                    <div className="text-zinc-100 whitespace-pre-wrap text-[15.5px] leading-relaxed opacity-100 transition-all [&_strong]:font-bold [&_strong]:text-white [&_em]:italic [&>p]:mb-4 [&>p:last-child]:mb-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{displayedResponse}</ReactMarkdown>
                    </div>

                    {isLongResponse && (
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
            </div>

            <DeleteConfirmationModal
                isOpen={isConfirmingDelete}
                onClose={() => setIsConfirmingDelete(false)}
                onConfirm={confirmDelete}
            />
        </div>
    );
}
