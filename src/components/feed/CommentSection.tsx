"use client";

import { User, Trash2, ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import type { PostCommentsState } from "@/hooks/usePostComments";

/** Comment input plus the list of loaded comments, with delete on the viewer's own. */
export function CommentSection({ state }: { state: PostCommentsState }) {
    const t = useTranslations('feed');
    const { comments, commentText, setCommentText, isSubmittingComment, commentToast, submitComment, deleteComment } = state;

    return (
        <div className="px-3 sm:px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
            {commentToast && (
                <div className="text-xs text-zinc-300 bg-zinc-800/60 border border-zinc-700/40 rounded-lg px-3 py-2">
                    {commentToast}
                </div>
            )}
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
            {comments.length > 0 && (
                <div className="space-y-3 pt-1">
                    {comments.map((c) => (
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
                                    onClick={() => deleteComment(c.id)}
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
    );
}
