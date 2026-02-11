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
        <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-8 text-center">
            <div className="max-w-2xl border-4 border-black p-8 md:p-12">
                <h2 className="font-sans font-bold uppercase tracking-widest mb-4 text-sm md:text-base text-gray-500">
                    Current Assignment
                </h2>
                <h1 className="font-serif text-4xl md:text-6xl font-black mb-8 leading-tight">
                    {activeAction.title}
                </h1>

                <p className="font-serif text-xl mb-12 max-w-lg mx-auto">
                    "The only way out is through. Report back when this action is complete."
                </p>

                <Button
                    onClick={handleReport}
                    className="text-2xl px-12 py-6 border-4"
                    disabled={isReporting}
                >
                    {isReporting ? "Filing Report..." : "REPORT COMPLETION"}
                </Button>
            </div>
        </div>
    );
}
