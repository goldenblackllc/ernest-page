import { useState } from "react";
import { User, Clock, Bookmark, ChevronDown, ChevronUp, Trash2, Lock, Globe, Eye, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Timestamp, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { useAuth } from "@/lib/auth/AuthContext";

interface RecastPostProps {
    post: {
        id: string;
        uid: string; // "Anonymous"
        type: 'recast';
        author_title?: string;
        rant?: string; // Optional if using content.en
        content_raw?: string; // The original rant
        content?: { en: string } | string;
        core_beliefs?: { negative: string; positive: string }[]; // Optional/Legacy
        new_rules?: { title: string; description: string }[]; // Optional/Legacy
        created_at: Timestamp;
        is_public?: boolean;
    };
}

export function RecastPostCard({ post }: RecastPostProps) {
    const [expandedRant, setExpandedRant] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    const { user } = useAuth();

    // New State for Polish
    const [isExpanded, setIsExpanded] = useState(false);
    // If user is author, default to 'raw', else 'public'
    const [viewMode, setViewMode] = useState<'public' | 'raw'>(
        user?.uid === post.uid ? 'raw' : 'public'
    );

    // Helper for timestamp
    const timeAgo = post.created_at ? formatDistanceToNow(post.created_at.toDate(), { addSuffix: true }) : "just now";

    const handleDelete = () => {
        setIsConfirmingDelete(true);
    };

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

    // --- NEW GHOSTWRITER UI ---
    // Check if we have valid content (either string or object)
    // Legacy posts might not have 'content' at all, just 'rant' and 'core_beliefs'
    const hasContent = !!post.content;

    if (hasContent) {
        // Strict Privacy: Always "Me"
        const displayName = "Me";

        // Determine Content to Show
        // Handle both string and object formats for content
        const postContentString = typeof post.content === 'string'
            ? post.content
            : post.content?.en || "";

        const textContent = viewMode === 'public' ? postContentString : (post.content_raw || post.rant || "No raw content available.");
        const isLongText = textContent.length > 300;
        const displayedText = isLongText && !isExpanded ? textContent.slice(0, 300) + "..." : textContent;

        return (
            <div className="bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative group">
                {/* Delete Button (Top Right) */}
                <button
                    onClick={handleDelete}
                    className="absolute top-4 right-4 text-zinc-600 hover:text-red-500 transition-colors z-10 opacity-0 group-hover:opacity-100"
                    title="Delete Post"
                >
                    <Trash2 className="w-4 h-4" />
                </button>

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-black/20">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                            <User className="w-5 h-5 text-zinc-400" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-gray-200">
                                {displayName}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                                <Clock className="w-3 h-3" />
                                <span>{timeAgo}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-end mr-6">
                        <div className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 mb-1">
                            <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">PROBLEM RESOLVED</span>
                        </div>
                    </div>
                </div>

                {/* Body (The Story) */}
                <div className="p-6">
                    <div className="text-gray-100 whitespace-pre-wrap text-base leading-relaxed opacity-100 transition-all">
                        {displayedText}
                    </div>

                    {isLongText && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="mt-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                        >
                            {isExpanded ? (
                                <>Read Less <ChevronUp className="w-3 h-3" /></>
                            ) : (
                                <>Read More <ChevronDown className="w-3 h-3" /></>
                            )}
                        </button>
                    )}
                </div>

                {/* UNIVERSAL FOOTER: Strategies & Beliefs (Visible in BOTH modes) */}
                <div className="px-6 pb-6 pt-2 space-y-4">
                    {/* Strategies */}
                    {post.new_rules && post.new_rules.length > 0 && (
                        <div className="p-4 bg-zinc-900/40 border border-white/5 rounded-lg">
                            <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <FileText className="w-3 h-3" />
                                New Protocol
                            </h4>
                            <ul className="space-y-1">
                                {post.new_rules.slice(0, 3).map((rule, idx) => (
                                    <li key={idx} className="text-xs text-zinc-400">
                                        <span className="text-emerald-500/50 mr-2">::</span>
                                        {rule.title}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Control Bar */}
                <div className="px-6 py-3 bg-black/40 border-t border-white/5 flex justify-between items-center">

                    {/* Left: View Mode Toggle */}
                    <button
                        onClick={() => setViewMode(viewMode === 'public' ? 'raw' : 'public')}
                        className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-white/5 transition-all group/btn"
                        title={viewMode === 'public' ? "View Original Rant" : "View Recast Story"}
                    >
                        {viewMode === 'public' ? (
                            <FileText className="w-4 h-4 text-zinc-500 group-hover:text-amber-400 transition-colors" />
                        ) : (
                            <Eye className="w-4 h-4 text-zinc-500 group-hover:text-indigo-400 transition-colors" />
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors">
                            {viewMode === 'public' ? "View Raw" : "View Public"}
                        </span>
                    </button>

                    {/* Right: Privacy Toggle */}
                    <button
                        onClick={togglePrivacy}
                        className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-white/5 transition-all group/btn"
                        title={post.is_public ? "Make Private" : "Make Public"}
                    >
                        {post.is_public ? (
                            <Globe className="w-4 h-4 text-emerald-600 group-hover:text-emerald-400 transition-colors" />
                        ) : (
                            <Lock className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors">
                            {post.is_public ? "Public" : "Private"}
                        </span>
                    </button>
                </div>

                <DeleteConfirmationModal
                    isOpen={isConfirmingDelete}
                    onClose={() => setIsConfirmingDelete(false)}
                    onConfirm={confirmDelete}
                />
            </div>
        );
    }

    // --- LEGACY UI (Fallback for old posts) ---
    // Grab the first belief pair as the headline
    const beliefs = post.core_beliefs || [];
    const mainBelief = beliefs[0] || { negative: "N/A", positive: "N/A" };
    const remainingBeliefsCount = Math.max(0, beliefs.length - 1);

    // Grab top 3 rules (strategies)
    const topStrategies = (post.new_rules || []).slice(0, 3);

    return (
        <div className="bg-[#1a1a1a] border border-zinc-900 rounded-xl overflow-hidden shadow-sm relative group">
            {/* Delete Button (Top Right) */}
            <button
                onClick={handleDelete}
                className="absolute top-3 right-3 text-zinc-600 hover:text-red-500 transition-colors z-10 opacity-0 group-hover:opacity-100"
                title="Delete Post"
            >
                <Trash2 className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-900 bg-zinc-950/50">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                        <User className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-zinc-500">Legacy Post</span>
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-wider">
                            <Clock className="w-3 h-3" />
                            <span>{timeAgo}</span>
                        </div>
                    </div>
                </div>
                <div className="px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 mr-6">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Recast</span>
                </div>
            </div>

            {/* Content Body */}
            <div className="p-0">
                {/* Section A: The Friction (The Rant) */}
                <div className="px-5 py-4 bg-zinc-950/30">
                    <div className={cn(
                        "relative text-sm text-gray-200 leading-relaxed transition-all duration-300",
                        !expandedRant && "line-clamp-3"
                    )}>
                        "{post.rant}"
                    </div>
                    <button
                        onClick={() => setExpandedRant(!expandedRant)}
                        className="mt-2 text-[10px] uppercase font-bold tracking-widest text-zinc-600 hover:text-zinc-400 flex items-center gap-1 transition-colors"
                    >
                        {expandedRant ? (
                            <>Read Less <ChevronUp className="w-3 h-3" /></>
                        ) : (
                            <>Read More <ChevronDown className="w-3 h-3" /></>
                        )}
                    </button>
                </div>

                {/* Section B: The Shift (Visual Hook) */}
                <div className="border-t border-b border-zinc-900 bg-zinc-900/20">
                    <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-zinc-900">
                        {/* Old Belief */}
                        <div className="flex-1 p-5 bg-red-950/5 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-red-500/20 group-hover:bg-red-500/40 transition-colors" />
                            <h4 className="text-[10px] font-bold text-red-900/70 uppercase tracking-widest mb-2">The Old Rule</h4>
                            <p className="text-zinc-500 line-through decoration-red-900/50 decoration-2 font-medium text-sm">
                                {mainBelief.negative}
                            </p>
                        </div>

                        {/* New Belief */}
                        <div className="flex-1 p-5 bg-green-950/5 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-1 h-full bg-green-500/20 group-hover:bg-green-500/40 transition-colors" />
                            <h4 className="text-[10px] font-bold text-green-900/70 uppercase tracking-widest mb-2">The New Rule</h4>
                            <p className="text-zinc-200 font-bold text-sm">
                                {mainBelief.positive}
                            </p>
                        </div>
                    </div>
                    {remainingBeliefsCount > 0 && (
                        <div className="px-4 py-1.5 bg-zinc-950 border-t border-zinc-900 text-center">
                            <span className="text-[10px] text-zinc-600 uppercase tracking-widest">
                                + {remainingBeliefsCount} more beliefs shifted
                            </span>
                        </div>
                    )}
                </div>

                {/* Section C: The Protocol (Strategies) */}
                <div className="p-5">
                    <h4 className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-3">
                        Active Protocol
                    </h4>
                    <ul className="space-y-2">
                        {topStrategies.map((strategy, idx) => (
                            <li key={idx} className="flex items-start gap-3 group">
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500/50 group-hover:bg-indigo-400 transition-colors shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                                <span className="text-sm text-zinc-400 group-hover:text-zinc-200 transition-colors">
                                    {strategy.title.replace(/^["']|["']$/g, '')}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 bg-zinc-950 border-t border-zinc-900 flex justify-end">
                <button className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-zinc-900 transition-all group">
                    <Bookmark className="w-4 h-4 text-zinc-600 group-hover:text-indigo-400 transition-colors" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 group-hover:text-zinc-300 transition-colors">
                        Save to Bible
                    </span>
                </button>
            </div>

            <DeleteConfirmationModal
                isOpen={isConfirmingDelete}
                onClose={() => setIsConfirmingDelete(false)}
                onConfirm={confirmDelete}
            />
        </div>
    );
}
