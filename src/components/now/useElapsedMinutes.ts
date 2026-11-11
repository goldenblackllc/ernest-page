import { useEffect, useState } from "react";
import type { Timestamp } from "firebase/firestore";
import { timestampToDate } from "@/lib/posts/timestamps";

/** Minutes since the action was committed to (at least one), counting live; null when the time is unknown. */
export function useElapsedMinutes(startedAt: Timestamp | null | undefined): number | null {
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNowMs(Date.now()), 30_000);
        return () => clearInterval(timer);
    }, []);
    const started = timestampToDate(startedAt)?.getTime();
    return started ? Math.max(1, Math.floor((nowMs - started) / 60_000)) : null;
}
