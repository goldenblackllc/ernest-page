"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/config";
import { useAuth } from "@/context/AuthContext";

/** Save a blob: share sheet on iOS (when possible), new tab on iOS otherwise, download link elsewhere. */
async function saveVideo(blob: Blob, filename: string, isIOS: boolean) {
    const blobUrl = URL.createObjectURL(blob);
    let shared = false;

    if (isIOS && navigator.share) {
        try {
            const file = new File([blob], filename, { type: 'video/mp4' });
            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file] });
                shared = true;
            }
        } catch (shareErr) {
            if ((shareErr as { name?: string } | null)?.name === 'AbortError') {
                shared = true;
            } else {
                console.warn('Native share failed, using fallback:', shareErr);
            }
        }
    }

    if (!shared) {
        if (isIOS) {
            window.open(blobUrl, '_blank');
        } else {
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            a.click();
        }
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

/** Also download the thumbnail, for use as a YouTube custom thumbnail. */
async function saveThumbnail(thumbUrl: string, postId: string, isIOS: boolean) {
    try {
        const thumbRes = await fetch(thumbUrl);
        if (!thumbRes.ok) return;
        const thumbBlob = await thumbRes.blob();
        const thumbBlobUrl = URL.createObjectURL(thumbBlob);
        const thumbFilename = `earnest-page-${postId}-thumbnail.jpg`;
        if (isIOS && navigator.share) {
            try {
                const thumbFile = new File([thumbBlob], thumbFilename, { type: 'image/jpeg' });
                if (navigator.canShare?.({ files: [thumbFile] })) {
                    await navigator.share({ files: [thumbFile] });
                }
            } catch { /* user cancelled or unsupported */ }
        } else {
            const ta = document.createElement('a');
            ta.href = thumbBlobUrl;
            ta.download = thumbFilename;
            ta.click();
        }
        setTimeout(() => URL.revokeObjectURL(thumbBlobUrl), 5000);
    } catch (thumbErr) {
        console.warn('Thumbnail download failed:', thumbErr);
    }
}

/** Author-only: renders the post as an MP4 on Cloud Functions and downloads it with its thumbnail. */
export function VideoDownloadButton({ postId, thumbnailUrl }: { postId: string; thumbnailUrl?: string }) {
    const { user } = useAuth();
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [videoToast, setVideoToast] = useState<string | null>(null);

    const download = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isGeneratingVideo || !user) return;
        setIsGeneratingVideo(true);
        setVideoToast(null);
        try {
            // Rendering runs on Cloud Functions and can take a few minutes
            const renderVideo = httpsCallable<{ postId: string; refresh: boolean }, { url: string }>(
                functions, 'renderPostVideo', { timeout: 540_000 },
            );
            const { data } = await renderVideo({ postId, refresh: true });
            const res = await fetch(data.url);
            if (!res.ok) throw new Error('Failed to download video');

            const blob = await res.blob();
            const isIOS = /iPhone|iPad/i.test(navigator.userAgent);
            await saveVideo(blob, `earnest-page-${postId}.mp4`, isIOS);
            if (thumbnailUrl) await saveThumbnail(thumbnailUrl, postId, isIOS);

            setVideoToast('Video + thumbnail ready!');
            setTimeout(() => setVideoToast(null), 3000);
        } catch (err) {
            console.error('Video download failed:', err);
            setVideoToast('Failed');
            setTimeout(() => setVideoToast(null), 3000);
        } finally {
            setIsGeneratingVideo(false);
        }
    };

    return (
        <button
            onClick={download}
            className="text-zinc-400 hover:text-white transition-colors relative"
            title="Download video for YouTube"
            disabled={isGeneratingVideo}
        >
            {isGeneratingVideo ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <Download className="w-4 h-4" />
            )}
            {videoToast && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] bg-zinc-800 text-white px-2 py-1 rounded whitespace-nowrap z-50">{videoToast}</span>
            )}
        </button>
    );
}
