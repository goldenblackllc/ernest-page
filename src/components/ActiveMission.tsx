"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import Link from "next/link";
import { ReportCompletionModal } from "@/components/ReportCompletionModal";

export function ActiveMission() {
    const { user } = useAuth();
    const [missions, setMissions] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        const fetchMissions = async () => {
            try {
                // Fetch all actions for the user that are NOT completed.
                // Note: != queries can be tricky without specific indexes, so we'll fetch active statuses.
                // If we want to strictly follow "status is not 'completed'", and we don't have an index,
                // we might need to fetch all and filter in memory if the dataset is small,
                // or just query for specific active statuses like 'pending', 'active', 'in_progress'.
                // For now, let's assume 'pending' and 'in_progress' are the active states.
                // Actually, the prompt explicitly said "where status is not 'completed'".
                // Let's try the logical negation if possible, or just fetch all and filter client-side 
                // to be safe against missing indexes for a prototype.

                const q = query(
                    collection(db, "directives"),
                    where("uid", "==", user.uid)
                );

                const snapshot = await getDocs(q);
                const activeMissions = snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter((doc: any) =>
                        doc.status !== 'completed' &&
                        doc.title?.trim().toUpperCase() !== 'DAILY STATUS UPDATES' &&
                        doc.title?.trim().toUpperCase() !== 'DAILY SATUS UPDATE'
                    );

                setMissions(activeMissions);
            } catch (error) {
                console.error("Error fetching missions:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchMissions();
    }, [user, isReportModalOpen]); // Re-fetch when modal closes/submits

    const handleSkip = () => {
        if (missions.length <= 1) return;
        setCurrentIndex((prev) => (prev + 1) % missions.length);
    };

    const handleReport = () => {
        setIsReportModalOpen(true);
    };

    if (loading) {
        return (
            <div className="bg-black text-white p-8 mb-8 border-2 border-black rounded-none animate-pulse">
                <div className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-4 font-bold">
                    ESTABLISHING DOWNLINK...
                </div>
            </div>
        );
    }

    if (missions.length === 0) {
        return null; // Don't block the feed
    }

    const currentMission = missions[currentIndex];

    return (
        <section className="bg-transparent text-white border-b border-white/10 px-4 py-3 flex justify-between items-center">
            <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-3">
                    {/* Status Dot */}
                    <div className="relative flex items-center justify-center w-2 h-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </div>

                    <div className="flex items-baseline gap-2 font-mono">
                        <span className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 shrink-0">
                            STATUS:
                        </span>
                        <h2 className="text-xs font-bold tracking-widest uppercase truncate text-zinc-300">
                            {currentMission.title || "AWAITING DIRECTIVE"}
                        </h2>
                    </div>
                </div>
            </div>

            <div className="flex gap-4 shrink-0 font-mono">
                <button
                    onClick={handleReport}
                    className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors"
                >
                    [ REPORT ]
                </button>

                <button
                    onClick={handleSkip}
                    disabled={missions.length <= 1}
                    className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-30"
                >
                    SKIP
                </button>
            </div>

            <ReportCompletionModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                action={currentMission}
            />
        </section>
    );
}
