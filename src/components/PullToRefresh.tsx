"use client";

import React, { useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

const THRESHOLD = 60;
const MAX_PULL = 120;

interface PullToRefreshProps {
    onRefresh: () => Promise<void>;
    children: React.ReactNode;
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const touchStartY = useRef(0);
    const isPulling = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const t = useTranslations("pwa");

    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            if (isRefreshing) return;

            // Only activate when scrolled to the very top
            const scrollTop =
                window.scrollY ||
                document.documentElement.scrollTop ||
                document.body.scrollTop;

            if (scrollTop <= 0) {
                touchStartY.current = e.touches[0].clientY;
                isPulling.current = true;
            }
        },
        [isRefreshing]
    );

    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (!isPulling.current || isRefreshing) return;

            const currentY = e.touches[0].clientY;
            const diff = currentY - touchStartY.current;

            if (diff > 0) {
                // Apply resistance: diminishing returns as you pull further
                const dampened = Math.min(
                    MAX_PULL,
                    diff * 0.4
                );
                setPullDistance(dampened);
            } else {
                // Scrolling up — cancel pull
                isPulling.current = false;
                setPullDistance(0);
            }
        },
        [isRefreshing]
    );

    const handleTouchEnd = useCallback(async () => {
        if (!isPulling.current || isRefreshing) return;
        isPulling.current = false;

        if (pullDistance >= THRESHOLD) {
            setIsRefreshing(true);
            setPullDistance(THRESHOLD); // Snap to threshold height

            try {
                await onRefresh();
            } finally {
                setIsRefreshing(false);
                setPullDistance(0);
            }
        } else {
            setPullDistance(0);
        }
    }, [pullDistance, isRefreshing, onRefresh]);

    const pastThreshold = pullDistance >= THRESHOLD;

    return (
        <div
            ref={containerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Pull indicator */}
            <motion.div
                animate={{ height: pullDistance > 0 || isRefreshing ? Math.max(pullDistance, isRefreshing ? 48 : 0) : 0 }}
                transition={isPulling.current ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden flex items-center justify-center"
            >
                {isRefreshing ? (
                    <div className="flex items-center gap-2 py-2">
                        <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                        <span className="text-xs text-zinc-500 uppercase tracking-widest font-bold">
                            {t("pullToRefresh.refreshing")}
                        </span>
                    </div>
                ) : pullDistance > 0 ? (
                    <div className="flex items-center gap-2 py-2">
                        <motion.div
                            animate={{ rotate: pastThreshold ? 180 : 0 }}
                            transition={{ duration: 0.15 }}
                            className="text-zinc-500"
                        >
                            ↓
                        </motion.div>
                        <span className="text-xs text-zinc-500 uppercase tracking-widest font-bold">
                            {pastThreshold
                                ? t("pullToRefresh.release")
                                : t("pullToRefresh.pull")}
                        </span>
                    </div>
                ) : null}
            </motion.div>

            {children}
        </div>
    );
}
