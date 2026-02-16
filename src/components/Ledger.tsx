import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { RecastPostCard } from "@/components/RecastPostCard";

export function Ledger() {
    const { user } = useAuth();
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        // Only Query Recast Posts (The New Feed)
        const qRecast = query(
            collection(db, "posts"),
            where("type", "==", "recast"),
            orderBy("created_at", "desc"),
            limit(20)
        );

        const unsubRecast = onSnapshot(qRecast, (snap) => {
            const recasts = snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                isRecast: true
            }));

            setEntries(recasts);
            setLoading(false);
        });

        return () => {
            unsubRecast();
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
                <RecastPostCard key={entry.id} post={entry} />
            ))}
        </section>
    );
}

