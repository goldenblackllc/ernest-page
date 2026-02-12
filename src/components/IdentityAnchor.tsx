"use client";

import { useState, useEffect } from "react";
import { collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";

export function IdentityAnchor() {
    const { user } = useAuth();
    const [identity, setIdentity] = useState("");
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newIdentity, setNewIdentity] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, "definitions"),
            where("userId", "==", user.uid),
            orderBy("updatedAt", "desc"),
            limit(1)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                setIdentity(snapshot.docs[0].data().text);
            } else {
                setIdentity(""); // Or explicitly null/undefined if we want to show placeholder differently
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching identity:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const handleOpenModal = () => {
        setNewIdentity(identity);
        setIsModalOpen(true);
    };

    const handleCommit = async () => {
        if (!user || !newIdentity.trim()) return;

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, "definitions"), {
                userId: user.uid,
                text: newIdentity,
                updatedAt: serverTimestamp()
            });
            setIsModalOpen(false);
        } catch (error) {
            console.error("Error updating identity:", error);
            alert("Failed to update identity.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return <div className="w-full py-12 bg-white flex justify-center"><span className="animate-pulse text-xs uppercase tracking-widest">Loading Reality...</span></div>;
    }

    return (
        <>
            {/* The Anchor (North Star Header) */}
            <div className="fixed top-0 left-0 w-full z-50 flex items-center justify-center h-14 pointer-events-none">
                <button
                    onClick={handleOpenModal}
                    className="pointer-events-auto text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-600 hover:text-zinc-300 transition-colors backdrop-blur-sm bg-zinc-950/30 px-4 py-1 rounded-full border border-white/5"
                >
                    {identity || "IDENTITY UNDEFINED."}
                </button>
            </div>

            {/* The Modal */}
            {
                isModalOpen && (
                    <div className="fixed inset-0 z-[100] bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-zinc-900 border border-zinc-800 p-8 max-w-2xl w-full relative shadow-2xl rounded-xl">
                            {/* Close 'X' just in case, though prompt didn't specify, user might get stuck */}
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="absolute top-4 right-4 text-zinc-500 hover:text-white font-bold transition-colors"
                            >
                                ✕
                            </button>

                            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-6 border-b border-zinc-800 pb-2">
                                DEFINE REALITY
                            </div>

                            <textarea
                                value={newIdentity}
                                onChange={(e) => setNewIdentity(e.target.value)}
                                placeholder="I AM..."
                                className="w-full text-3xl md:text-4xl font-black uppercase border-none focus:ring-0 resize-y min-h-[200px] bg-transparent text-white placeholder:text-zinc-700 p-0 leading-tight mb-8"
                                autoFocus
                            />

                            <div className="flex justify-end">
                                <button
                                    onClick={handleCommit}
                                    disabled={isSubmitting}
                                    className="bg-zinc-950 text-white px-8 py-4 text-xs font-bold uppercase tracking-[0.2em] hover:bg-zinc-800 transition-colors disabled:opacity-50 border border-zinc-800 rounded-lg"
                                >
                                    {isSubmitting ? "COMMITTING..." : "COMMIT NEW IDENTITY"}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </>
    );
}
