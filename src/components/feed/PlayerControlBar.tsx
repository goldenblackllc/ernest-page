"use client";

import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, Maximize, Minimize } from "lucide-react";
import type { FeedAudio } from "@/hooks/useFeedAudio";

/** Format time as M:SS */
function formatTime(seconds: number) {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

interface PlayerControlBarProps {
    audio: FeedAudio;
    visible: boolean;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
}

/** YouTube-style bar: scrubber, play/pause, skip ±10s, time, mute and fullscreen. */
export function PlayerControlBar({ audio, visible, isFullscreen, onToggleFullscreen }: PlayerControlBarProps) {
    const { isPlaying, audioProgress, audioDuration, audioCurrentTime, isMuted, toggleMute, toggleAudio, seek, skip } = audio;

    return (
        <div
            className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
        >
            {/* Gradient backdrop */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />

            <div className={`relative ${isFullscreen ? 'px-6 pb-4 pt-8' : 'px-3 sm:px-4 pb-2 pt-6'}`}>
                {/* Scrubber / progress bar */}
                <div className="group flex items-center mb-1.5">
                    <input
                        type="range"
                        min={0}
                        max={audioDuration || 100}
                        step={0.1}
                        value={audioCurrentTime}
                        onChange={(e) => { e.stopPropagation(); seek(parseFloat(e.target.value)); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full h-1 group-hover:h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer transition-all duration-150 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:opacity-0 [&::-webkit-slider-thumb]:group-hover:opacity-100 [&::-webkit-slider-thumb]:transition-opacity"
                        style={{
                            background: `linear-gradient(to right, rgba(255,255,255,0.8) ${audioProgress * 100}%, rgba(255,255,255,0.2) ${audioProgress * 100}%)`
                        }}
                    />
                </div>

                {/* Control buttons row */}
                <div className="flex items-center gap-2 sm:gap-3">
                    {/* Play / Pause */}
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleAudio(); }}
                        className="text-white hover:text-white/80 transition-colors p-1"
                        title={isPlaying ? 'Pause' : 'Play'}
                    >
                        {isPlaying ? <Pause className={isFullscreen ? 'w-7 h-7' : 'w-5 h-5'} fill="white" /> : <Play className={isFullscreen ? 'w-7 h-7' : 'w-5 h-5'} fill="white" />}
                    </button>

                    {/* Skip back 10s */}
                    <button
                        onClick={(e) => { e.stopPropagation(); skip(-10); }}
                        className="text-white/70 hover:text-white transition-colors p-1"
                        title="Back 10 seconds"
                    >
                        <SkipBack className={isFullscreen ? 'w-6 h-6' : 'w-4 h-4'} />
                    </button>

                    {/* Skip forward 10s */}
                    <button
                        onClick={(e) => { e.stopPropagation(); skip(10); }}
                        className="text-white/70 hover:text-white transition-colors p-1"
                        title="Forward 10 seconds"
                    >
                        <SkipForward className={isFullscreen ? 'w-6 h-6' : 'w-4 h-4'} />
                    </button>

                    {/* Time display */}
                    <span className={`text-white/60 font-mono tabular-nums ml-1 ${isFullscreen ? 'text-base' : 'text-xs'}`}>
                        {formatTime(audioCurrentTime)} / {formatTime(audioDuration)}
                    </span>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Mute toggle */}
                    <button
                        onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                        className="text-white/70 hover:text-white transition-colors p-1"
                        title={isMuted ? 'Unmute' : 'Mute'}
                    >
                        {isMuted ? <VolumeX className={isFullscreen ? 'w-6 h-6' : 'w-4 h-4'} /> : <Volume2 className={isFullscreen ? 'w-6 h-6' : 'w-4 h-4'} />}
                    </button>

                    {/* Fullscreen toggle */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleFullscreen(); }}
                        className="text-white/70 hover:text-white transition-colors p-1"
                        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                    >
                        {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
