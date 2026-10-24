"use client";

import { useState, useEffect } from "react";
import type { Post } from "@/types/post";
import { getPostImages } from "./postFields";

interface PostMediaProps {
    post: Post;
    isPlaying: boolean;
    audioCurrentTime: number;
}

/**
 * The picture behind the player: the thumbnail before playback, then the image carousel
 * (per-message images follow the audio; older posts rotate on a timer). Posts whose
 * images are still being generated get a plain dark poster instead.
 */
export function PostMedia({ post, isPlaying, audioCurrentTime }: PostMediaProps) {
    const { heroUrl, imageUrls, isPerMessage, hasImage } = getPostImages(post);

    // Legacy timer carousel for old posts
    const [carouselIndex, setCarouselIndex] = useState(0);
    useEffect(() => {
        if (isPerMessage || imageUrls.length <= 1 || !isPlaying) return;
        const timer = setInterval(() => {
            setCarouselIndex(prev => (prev + 1) % imageUrls.length);
        }, 10000);
        return () => clearInterval(timer);
    }, [imageUrls.length, isPlaying, isPerMessage]);

    if (!hasImage) {
        return <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black" />;
    }

    // Per-message: derive image index from audio timestamp + message boundaries
    const messageImageIndex = (() => {
        const boundaries = post.audio_message_boundaries;
        if (!isPerMessage || !boundaries?.length) return 0;
        for (let i = boundaries.length - 1; i >= 0; i--) {
            if (audioCurrentTime >= boundaries[i].startTime) {
                return Math.min(i, imageUrls.length - 1);
            }
        }
        return 0;
    })();

    const currentImageIndex = isPerMessage
        ? messageImageIndex
        : (imageUrls.length > 0 ? carouselIndex % imageUrls.length : 0);
    const currentImageUrl = imageUrls[currentImageIndex] || heroUrl;
    // The next image loads hidden so it is ready when its turn comes. Per-message images
    // stop at the last message; the timer carousel wraps around.
    const nextImageIndex = isPerMessage ? currentImageIndex + 1 : (currentImageIndex + 1) % imageUrls.length;

    // Every image loads lazily: a card's pictures download only as it comes near the screen.
    return (
        <>
            {/* Thumbnail poster — shown before playback starts */}
            {post.thumbnail_url && !isPlaying && (
                <img
                    src={post.thumbnail_url}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover z-[1] transition-opacity duration-500"
                    style={{ opacity: 1 }}
                />
            )}
            {isPerMessage || imageUrls.length > 1 ? (
                /* Only the current and next image, so a post's other images aren't downloaded up front */
                <>
                    {imageUrls[currentImageIndex] && (
                        <img
                            key={`img-${currentImageIndex}`}
                            src={imageUrls[currentImageIndex]}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-contain transition-opacity duration-500"
                            style={{ opacity: 1 }}
                        />
                    )}
                    {nextImageIndex !== currentImageIndex && imageUrls[nextImageIndex] && (
                        <img
                            key={`img-${nextImageIndex}`}
                            src={imageUrls[nextImageIndex]}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-contain"
                            style={{ opacity: 0 }}
                        />
                    )}
                </>
            ) : (
                <img
                    src={currentImageUrl}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-contain"
                />
            )}
        </>
    );
}
