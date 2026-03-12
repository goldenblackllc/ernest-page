"use client";

import React from "react";
import { Mail } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

interface CheckInCardProps {
    characterTitle: string;
    avatarUrl?: string;
}

export function CheckInCard({ characterTitle, avatarUrl }: CheckInCardProps) {
    const { user } = useAuth();

    const handleClick = async () => {
        // Mark check-in as done (resets the 30-day clock)
        if (user) {
            try {
                await updateDoc(doc(db, 'users', user.uid), {
                    last_thirty_day_checkin: new Date().toISOString(),
                });
            } catch (e) {
                console.error('Failed to update check-in date:', e);
            }
        }

        // Open MirrorChat with check-in context
        window.dispatchEvent(new CustomEvent('open-mirror-checkin', {
            detail: {
                context: "I am here for my 30 day check-in.",
            },
        }));
    };

    return (
        <button
            onClick={handleClick}
            className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden shadow-sm relative text-left w-full hover:bg-zinc-800 transition-colors"
        >
            <div className="flex items-center gap-4 p-5">
                <div className="w-14 h-14 rounded-full bg-zinc-800 border-2 border-white/20 overflow-hidden shrink-0">
                    {avatarUrl ? (
                        <img src={avatarUrl} alt={characterTitle} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Mail className="w-5 h-5 text-zinc-500" />
                        </div>
                    )}
                </div>
                <div>
                    <p className="text-sm font-bold text-white mb-0.5">30 Day Check-in ✓</p>
                    <p className="text-base font-bold text-white">{characterTitle}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Tap to start →</p>
                </div>
            </div>
        </button>
    );
}
