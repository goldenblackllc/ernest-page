"use client";

import { useState, useRef } from "react";
import { getPostText } from '@functions/lib/getPostText';
import { useAuth } from "@/context/AuthContext";
import { useFeedAudio } from "@/hooks/useFeedAudio";
import { usePostComments } from "@/hooks/usePostComments";
import type { Post } from "@/types/post";
import { getPostAudio, getPostImages, getLetterRatio } from "@/components/feed/postFields";
import { buildSubtitleTrack } from "@/components/feed/subtitles";
import { FeedVideoPlayer } from "@/components/feed/FeedVideoPlayer";
import { PostAuthorOverlay } from "@/components/feed/PostAuthorOverlay";
import { PostActions } from "@/components/feed/PostActions";
import { PostTextView } from "@/components/feed/PostTextView";
import { AuthorChatTranscript, hasPrivateChat } from "@/components/feed/AuthorChatTranscript";
import { CommentSection } from "@/components/feed/CommentSection";

interface FeedPostProps {
    post: Post;
    followingMap?: Record<string, string>;
    onFollowClick?: (authorId: string) => void;
    onRequestDelete?: (postId: string) => void;
    digestMode?: boolean;
}

export function FeedPostCard(props: FeedPostProps) {
    // Posts without audio are still processing — don't render. Checked here, not in
    // the card body, so the body's hooks run in the same order on every render.
    if (!getPostAudio(props.post).hasAudio) return null;
    return <FeedPostCardBody {...props} />;
}

/**
 * A post as a 16:9 "short": audio with karaoke subtitles over the post's images
 * (or a plain poster while they are generated), followed by the action footer and
 * the optional text view, author chat transcript and comments.
 */
function FeedPostCardBody({ post, followingMap, onFollowClick, onRequestDelete, digestMode }: FeedPostProps) {
    const { user } = useAuth();
    const cardRef = useRef<HTMLDivElement>(null);
    const [isTextView, setIsTextView] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isCommentOpen, setIsCommentOpen] = useState(false);

    // Text and audio
    const { letter: letterText, response: responseText } = getPostText(post);
    const { unifiedAudioUrl, wordTimestamps } = getPostAudio(post);
    const letterRatio = getLetterRatio(post, letterText, responseText);

    const audio = useFeedAudio({
        unifiedAudioUrl,
        letterAudioUrl: post.letter_audio_url,
        responseAudioUrl: post.response_audio_url,
        letterRatio,
    });
    const comments = usePostComments(post.id, post.comments);

    // Public face content — prefer Q&A short format when available
    const hasShortFormat = Boolean(post.short_question && post.short_answer);
    const publicLetter = hasShortFormat ? post.short_question : letterText;
    const publicResponse = hasShortFormat ? post.short_answer : responseText;
    const publicPseudonym = post.author_title || post.public_post?.pseudonym || post.pseudonym || "Anonymous";

    // Author and following
    const postAuthorId = post.authorId || post.uid;
    const isAuthor = user?.uid === postAuthorId;
    const customAlias = postAuthorId && followingMap?.[postAuthorId] ? followingMap[postAuthorId] : null;
    const canFollow = Boolean(!isAuthor && !customAlias && postAuthorId && onFollowClick && !digestMode);
    const showChat = isAuthor && hasPrivateChat(post);

    // Letter and response are required
    if (!publicLetter || !publicResponse) {
        return null;
    }

    const track = buildSubtitleTrack(publicLetter, publicResponse, wordTimestamps, letterRatio);

    return (
        <div ref={cardRef} className="bg-black border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-lg relative font-sans">
            <FeedVideoPlayer
                post={post}
                audio={audio}
                track={track}
                letterRatio={letterRatio}
                isUnified={Boolean(unifiedAudioUrl)}
                fullscreenRef={cardRef}
                digestMode={digestMode}
                renderHeader={(isFullscreen) => (
                    <PostAuthorOverlay
                        post={post}
                        isFullscreen={isFullscreen}
                        displayName={customAlias || publicPseudonym}
                        isAuthor={isAuthor}
                        canFollow={canFollow}
                        onFollow={() => postAuthorId && onFollowClick?.(postAuthorId)}
                        digestMode={digestMode}
                    />
                )}
            />

            <PostActions
                post={post}
                audio={audio}
                isAuthor={isAuthor}
                hasPrivateChat={showChat}
                hasImage={getPostImages(post).hasImage}
                digestMode={digestMode}
                isTextView={isTextView}
                onToggleTextView={() => { setIsTextView(!isTextView); if (!isTextView) setIsChatOpen(false); }}
                isChatOpen={isChatOpen}
                onToggleChat={() => { setIsChatOpen(!isChatOpen); if (!isChatOpen) setIsTextView(false); }}
                onToggleComments={() => setIsCommentOpen(!isCommentOpen)}
                onRequestDelete={onRequestDelete}
            />

            {isTextView && (
                <PostTextView
                    transcript={post.public_post?.condensed_transcript}
                    userLabel={post.public_post?.pseudonym || publicPseudonym || 'You'}
                    letter={publicLetter}
                    response={publicResponse}
                />
            )}

            {isCommentOpen && <CommentSection state={comments} />}

            {/* Original chat transcript — shown when the author taps the Chat button */}
            {showChat && isChatOpen && <AuthorChatTranscript post={post} />}
        </div>
    );
}
