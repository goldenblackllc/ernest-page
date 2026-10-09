"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/auth/authFetch";
import type { PostComment } from "@/types/post";

function openAuthModal() {
    window.dispatchEvent(new CustomEvent('open-auth-modal'));
}

/**
 * Loads, adds and deletes the viewer-visible comments on a post.
 * Comments load automatically when the post already has some.
 */
export function usePostComments(postId: string, initialCount: number | undefined) {
    const { user } = useAuth();
    const t = useTranslations('feed');

    const [commentText, setCommentText] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [commentToast, setCommentToast] = useState<string | null>(null);
    const [comments, setComments] = useState<PostComment[]>([]);
    const [commentsLoaded, setCommentsLoaded] = useState(false);

    const fetchComments = useCallback(async () => {
        if (!user || commentsLoaded) return;
        try {
            const res = await authFetch(user, `/api/posts/comments?postId=${postId}`);
            if (res.ok) {
                const data = await res.json();
                setComments(data.comments || []);
            }
            setCommentsLoaded(true);
        } catch (err) {
            console.error('Failed to fetch comments:', err);
        }
    }, [user, postId, commentsLoaded]);

    // Auto-load comments if the post has them
    useEffect(() => {
        if ((initialCount && initialCount > 0) && !commentsLoaded) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch; fetchComments only sets state after its await
            fetchComments();
        }
    }, [initialCount, commentsLoaded, fetchComments]);

    const submitComment = async () => {
        if (!user) {
            openAuthModal();
            return;
        }
        if (!commentText.trim() || isSubmittingComment) return;
        setIsSubmittingComment(true);
        try {
            const res = await authFetch(user, '/api/posts/comment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postId, comment: commentText.trim() }),
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

    const deleteComment = async (commentId: string) => {
        if (!user) {
            openAuthModal();
            return;
        }
        setComments(prev => prev.filter(x => x.id !== commentId));
        try {
            await authFetch(user, '/api/posts/comment/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ postId, commentId }),
            });
        } catch (err) {
            console.error('Failed to delete comment:', err);
        }
    };

    return {
        comments,
        commentText,
        setCommentText,
        isSubmittingComment,
        commentToast,
        submitComment,
        deleteComment,
    };
}

export type PostCommentsState = ReturnType<typeof usePostComments>;
