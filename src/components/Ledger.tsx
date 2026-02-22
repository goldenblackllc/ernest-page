import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { RecastPostCard } from "@/components/RecastPostCard";
import { CheckInPostCard } from "@/components/CheckInPostCard";
import { Sparkles } from "lucide-react";

export function Ledger() {
    const { user } = useAuth();
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPublishingCheckIn, setIsPublishingCheckIn] = useState(false);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        // Query All Feed Posts
        const qPosts = query(
            collection(db, "posts"),
            orderBy("created_at", "desc"),
            limit(20)
        );

        const unsubPosts = onSnapshot(qPosts, (snap) => {
            const posts = snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            setEntries(posts);
            setLoading(false);
        });

        return () => {
            unsubPosts();
        };
    }, [user]);

    useEffect(() => {
        const handleStart = () => setIsPublishingCheckIn(true);
        const handleEnd = () => setIsPublishingCheckIn(false);

        window.addEventListener('checkin-publishing-start', handleStart);
        window.addEventListener('checkin-publishing-end', handleEnd);

        return () => {
            window.removeEventListener('checkin-publishing-start', handleStart);
            window.removeEventListener('checkin-publishing-end', handleEnd);
        };
    }, []);

    if (loading) {
        return <div className="p-12 text-center text-xs uppercase tracking-widest animate-pulse">Syncing Reality...</div>;
    }

    if (entries.length === 0 && !isPublishingCheckIn) {
        return (
            <div className="p-12 text-center border border-zinc-800 border-dashed rounded-xl bg-transparent">
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-mono">Log is empty.</p>
            </div>
        );
    }

    return (
        <section className="flex flex-col gap-8">
            {isPublishingCheckIn && (
                <div className="bg-[#1a1a1a] border border-emerald-500/20 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative animate-pulse flex items-center justify-center p-8">
                    <div className="flex flex-col items-center gap-3">
                        <Sparkles className="w-6 h-6 text-emerald-500/80 animate-spin-slow" />
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest inline-block text-center mt-2">
                            Writing to Dear Earnest...
                        </span>
                    </div>
                </div>
            )}

            {entries.map((entry) => (
                entry.type === 'checkin'
                    ? <CheckInPostCard key={entry.id} post={entry as any} />
                    : <RecastPostCard key={entry.id} post={entry as any} />
            ))}
        </section>
    );
}

