"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode, type RefObject } from "react";
import { Play, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Post } from "@/types/post";
import type { FeedAudio } from "@/hooks/useFeedAudio";
import { PostMedia } from "./PostMedia";
import { PlayerControlBar } from "./PlayerControlBar";
import { getPostImages } from "./postFields";
import { getCurrentSubtitle, type SubtitleTrack } from "./subtitles";

const OUTLINE_LARGE = '-2px -2px 0 rgba(0,0,0,0.9), 2px -2px 0 rgba(0,0,0,0.9), -2px 2px 0 rgba(0,0,0,0.9), 2px 2px 0 rgba(0,0,0,0.9), 0 3px 6px rgba(0,0,0,0.5)';
const OUTLINE_SMALL = '-1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.5)';

interface FeedVideoPlayerProps {
    post: Post;
    audio: FeedAudio;
    track: SubtitleTrack;
    letterRatio: number;
    /** True for a single unified audio file (not the legacy letter + response pair). */
    isUnified: boolean;
    /** Element that goes fullscreen (the whole card, so the footer comes along). */
    fullscreenRef: RefObject<HTMLDivElement | null>;
    digestMode?: boolean;
    /** Top overlay (author row); receives the fullscreen flag for sizing. */
    renderHeader: (isFullscreen: boolean) => ReactNode;
}

/**
 * The 16:9 "short": images (or a plain poster while images are generating), title,
 * karaoke subtitles, a big play button and the auto-hiding control bar.
 */
export function FeedVideoPlayer({ post, audio, track, letterRatio, isUnified, fullscreenRef, digestMode, renderHeader }: FeedVideoPlayerProps) {
    const t = useTranslations('feed');
    const { isPlaying, isAudioLoading, toggleAudio } = audio;

    const [controlsVisible, setControlsVisible] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Auto-hide controls after 3 seconds of inactivity while playing
    const showControls = useCallback(() => {
        setControlsVisible(true);
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        if (isPlaying) {
            controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
        }
    }, [isPlaying]);

    // Show controls when not playing, auto-hide when playing
    useEffect(() => {
        if (!isPlaying) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- controls visibility is tied to the auto-hide timer managed here; deriving it would skip the 3s delay on resume
            setControlsVisible(true);
            if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        } else {
            controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
        }
        return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
    }, [isPlaying]);

    const toggleFullscreen = useCallback(() => {
        if (!fullscreenRef.current) return;
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        } else {
            fullscreenRef.current.requestFullscreen().catch(() => {});
        }
    }, [fullscreenRef]);

    // Sync fullscreen state
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const subtitle = getCurrentSubtitle(track, {
        audioPhase: audio.audioPhase,
        isPlaying,
        audioCurrentTime: audio.audioCurrentTime,
        audioProgress: audio.audioProgress,
        isUnified,
        letterRatio,
    });

    // Without an image yet, the poster shows the title, or the opening line when there is none
    const { hasImage } = getPostImages(post);
    const posterTitle = post.title || (!hasImage ? track.allChunks[0] : undefined);

    return (
        <div
            className="relative w-full overflow-hidden aspect-video bg-black"
            onClick={(e) => { e.stopPropagation(); toggleAudio(); showControls(); }}
            onMouseMove={showControls}
            onTouchStart={showControls}
            style={{ cursor: 'pointer' }}
        >
            <PostMedia post={post} isPlaying={isPlaying} audioCurrentTime={audio.audioCurrentTime} />

            {/* Top: Author identity — always visible (not tied to playback controls) */}
            {renderHeader(isFullscreen)}

            {/* Large centered play button — visible when idle (YouTube thumbnail style) */}
            {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                    <div className={`rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20 transition-transform duration-200 hover:scale-110 ${isFullscreen ? 'w-24 h-24' : 'w-16 h-16 sm:w-20 sm:h-20'}`}>
                        {isAudioLoading ? (
                            <Loader2 className={`text-white animate-spin ${isFullscreen ? 'w-12 h-12' : 'w-7 h-7 sm:w-9 sm:h-9'}`} />
                        ) : (
                            <Play className={`text-white ml-1 ${isFullscreen ? 'w-12 h-12' : 'w-7 h-7 sm:w-9 sm:h-9'}`} fill="white" />
                        )}
                    </div>
                </div>
            )}

            {/* Bold title overlay — lower-third on thumbnail, DigestCard-style outlined text, fades on play */}
            {posterTitle && !isPlaying && !post.thumbnail_url && (
                <div className={`absolute left-0 right-0 z-10 pointer-events-none ${isFullscreen ? 'bottom-24 px-10' : 'bottom-14 sm:bottom-16 px-4 sm:px-6'}`}>
                    {digestMode && (
                        <p className={`uppercase tracking-[0.2em] text-white/70 font-bold mb-1 ${isFullscreen ? 'text-sm' : 'text-[10px]'}`}>
                            {t('digestLabel')}
                        </p>
                    )}
                    <h3 className={`font-black text-white leading-snug ${post.title ? '' : 'line-clamp-3'} ${isFullscreen ? 'text-5xl sm:text-6xl lg:text-7xl' : 'text-2xl sm:text-4xl lg:text-5xl'}`} style={{ textShadow: OUTLINE_LARGE }}>
                        {posterTitle}
                    </h3>
                </div>
            )}

            {/* Subtitle text — lower-third style (above control bar) */}
            {isPlaying && (
                <div className={`absolute left-0 right-0 z-10 pointer-events-none transition-all duration-300 ${isFullscreen ? (controlsVisible ? 'bottom-24' : 'bottom-8') + ' px-12' : (controlsVisible ? 'bottom-16 sm:bottom-[4.5rem]' : 'bottom-4 sm:bottom-6') + ' px-4 sm:px-8'}`}>
                    <div className={`text-center max-w-[90%] mx-auto transition-opacity duration-300 ${subtitle ? 'opacity-100' : 'opacity-0'}`}>
                        <p className={`font-bold text-white leading-snug ${isFullscreen ? 'text-3xl sm:text-4xl lg:text-5xl' : 'text-base sm:text-xl lg:text-2xl'}`} style={{ whiteSpace: 'pre-line', textShadow: isFullscreen ? OUTLINE_LARGE : OUTLINE_SMALL }}>
                            {subtitle?.words && subtitle.activeWordIndex !== undefined && subtitle.activeWordIndex >= 0 ? (
                                subtitle.words.map((w, i) => (
                                    <span
                                        key={i}
                                        className={`transition-colors duration-100 ${i === subtitle.activeWordIndex ? 'text-amber-300' : 'text-white'}`}
                                    >
                                        {w.word}{i < subtitle.words!.length - 1 ? ' ' : ''}
                                    </span>
                                ))
                            ) : (
                                subtitle?.current || ' '
                            )}
                        </p>
                    </div>
                </div>
            )}

            <PlayerControlBar
                audio={audio}
                visible={controlsVisible}
                isFullscreen={isFullscreen}
                onToggleFullscreen={toggleFullscreen}
            />
        </div>
    );
}
