import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { RecastPostCard } from "@/components/RecastPostCard";
import { CheckInPostCard } from "@/components/CheckInPostCard";

export function Ledger() {
    const { user } = useAuth();
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

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

    if (loading) {
        return <div className="p-12 text-center text-xs uppercase tracking-widest animate-pulse">Syncing Reality...</div>;
    }

    if (entries.length === 0) {
        return (
            <div className="p-12 text-center border border-zinc-800 border-dashed rounded-xl bg-transparent">
                <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-mono">Log is empty.</p>
            </div>
        );
    }

    return (
        <section className="flex flex-col gap-8">
            {entries.map((entry) => (
                entry.type === 'checkin'
                    ? <CheckInPostCard key={entry.id} post={entry as any} />
                    : <RecastPostCard key={entry.id} post={entry as any} />
            ))}
        </section>
    );
}

