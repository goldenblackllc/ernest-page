"use client";

import { useLocked } from "@/context/LockedContext";
import { Button } from "@/components/ui/Button";
import { useState } from "react";

export function LockedScreen() {
    const { isLocked, activeAction, unlockApp } = useLocked();
    const [isReporting, setIsReporting] = useState(false);

    if (!isLocked || !activeAction) return null;

    const handleReport = () => {
        setIsReporting(true);
        // Simulate reporting delay or open a report form
        setTimeout(() => {
            unlockApp();
            setIsReporting(false);
        }, 1000);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col items-center justify-center p-8 text-center text-zinc-300">
            <div className="max-w-2xl border border-zinc-800 p-8 md:p-12 bg-zinc-900/30 backdrop-blur-md rounded-2xl">
                <h2 className="font-bold uppercase tracking-widest mb-4 text-xs md:text-sm text-zinc-500">
                    Current Assignment
                </h2>
                <h1 className="font-black text-4xl md:text-6xl mb-8 leading-tight text-white uppercase tracking-tighter">
                    {activeAction.title}
                </h1>

                <p className="text-xl mb-12 max-w-lg mx-auto text-zinc-400">
                    "The only way out is through. Report back when this action is complete."
                </p>

                <Button
                    onClick={handleReport}
                    className="text-lg px-12 py-6 border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-white rounded-full transition-all hover:scale-105 shadow-xl shadow-zinc-900/50"
                    disabled={isReporting}
                >
                    {isReporting ? "Filing Report..." : "REPORT COMPLETION"}
                </Button>
            </div>
        </div>
    );
}
