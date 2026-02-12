import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot, limit, updateDoc, doc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { Eye } from "lucide-react";

export function Ledger() {
    const { user } = useAuth();
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        // 1. Query Private Entries
        const qPrivate = query(
            collection(db, "entries"),
            where("uid", "==", user.uid),
            orderBy("createdAt", "desc"),
            limit(20)
        );

        // 2. Query Public Ether
        const qEther = query(
            collection(db, "global_ether"),
            orderBy("createdAt", "desc"),
            limit(20)
        );

        // Manage subscriptions manually to merge
        let privateData: any[] = [];
        let etherData: any[] = [];

        const mergeAndSet = () => {
            const merged = [...privateData, ...etherData].sort((a, b) => {
                const tA = a.createdAt?.toMillis() || 0;
                const tB = b.createdAt?.toMillis() || 0;
                return tB - tA;
            });
            setEntries(merged);
            setLoading(false);
        };

        const unsubPrivate = onSnapshot(qPrivate, (snap) => {
            privateData = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), isPrivate: true }));
            mergeAndSet();
        });

        const unsubEther = onSnapshot(qEther, (snap) => {
            etherData = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), isPrivate: false }));
            mergeAndSet();
        });

        return () => {
            unsubPrivate();
            unsubEther();
        };
    }, [user]);

    const handleWitness = async (id: string, currentLikes: number) => {
        const ref = doc(db, "global_ether", id);
        await updateDoc(ref, {
            likes: increment(1)
        });
    };

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
        <section className="flex flex-col gap-4">
            {entries.map((entry) => (
                <div
                    key={entry.id}
                    className={`p-6 rounded-xl transition-all mx-0 md:mx-0 w-full backdrop-blur-sm border ${entry.isPrivate
                        ? "bg-zinc-950 border-zinc-800 shadow-sm" // Private
                        : "bg-zinc-950 border-zinc-800" // Public/Ether
                        }`}
                >
                    <div className="flex justify-between items-start mb-4">
                        <span className={`text-[10px] font-bold uppercase tracking-widest font-mono ${entry.isPrivate ? "text-zinc-500" : ""}`}>
                            {entry.isPrivate ? (
                                entry.mode === 'want' ? <span className="text-blue-500">TARGET ACQUIRED</span> :
                                    entry.mode === 'problem' ? <span className="text-orange-500">FRICTION</span> :
                                        entry.mode === 'next' ? <span className="text-emerald-500">ACT</span> :
                                            entry.type === 'action_report' ? "ACTION REPORT" :
                                                entry.type === 'yield_check' ? "YIELD ANOMALY" :
                                                    "LOG ENTRY"
                            ) : null}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-600">
                            {entry.createdAt?.toDate().toLocaleTimeString()}
                        </span>
                    </div>

                    {/* Content Body */}
                    {entry.isPrivate ? (
                        /* Private Styling */
                        <>
                            {entry.traits && entry.traits.length > 0 && (
                                <div className="mb-3 border-b border-zinc-800 pb-2">
                                    <h4 className="font-bold uppercase tracking-widest text-[10px] text-zinc-600 font-mono">
                                        {entry.traits.join(" // ")}
                                    </h4>
                                </div>
                            )}

                            {entry.type === 'action_report' && (
                                <h4 className="font-bold uppercase tracking-widest text-sm mb-2 text-zinc-200">
                                    {entry.actionTitle}
                                </h4>
                            )}

                            <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-zinc-300">
                                {entry.commitment ? (
                                    <span className="font-bold text-blue-400">{entry.commitment}</span>
                                ) : (
                                    entry.text
                                )}
                            </div>

                            {entry.image && (
                                <div className="mt-4">
                                    <img src={entry.image} alt="Evidence" className="max-w-full rounded-lg border border-zinc-800" />
                                </div>
                            )}
                            {entry.unexpectedYield && (
                                <div className="bg-zinc-950 text-zinc-400 p-3 mt-4 text-xs font-mono rounded-lg border border-zinc-800">
                                    <span className="text-zinc-600 mr-2 uppercase tracking-widest">YIELD:</span>
                                    {entry.unexpectedYield}
                                </div>
                            )}
                        </>
                    ) : (
                        /* Public Ether Styling */
                        <div className="relative">
                            <h3 className="font-bold uppercase tracking-widest text-xs mb-2 text-zinc-100">
                                {entry.title}
                            </h3>
                            <div className="whitespace-pre-wrap font-serif italic text-sm leading-relaxed text-zinc-400 px-1">
                                "{entry.story || entry.text}"
                            </div>

                            {entry.visual_tag && (
                                <div className="mt-3 text-[10px] font-mono text-zinc-600 uppercase">
                                    [{entry.visual_tag}]
                                </div>
                            )}

                            {/* Witness Interaction */}
                            <div className="mt-4 flex justify-end">
                                <button
                                    onClick={() => handleWitness(entry.id, entry.likes || 0)}
                                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600 hover:text-blue-400 transition-colors"
                                >
                                    <Eye className="w-3 h-3" />
                                    Witness {entry.likes > 0 && `(${entry.likes})`}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </section>
    );
}
