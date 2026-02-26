"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils";
import CheckInWizardModal from "@/components/checkin/CheckInWizardModal";
import { Plus, Target, MessageCircle } from "lucide-react";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterBible } from "@/types/character";
import { MirrorChat } from "./MirrorChat";

export function TriagePanel() {
    const { user } = useAuth();

    // Global Action States
    const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
    const [isCheckInOpen, setIsCheckInOpen] = useState(false);
    const [isMirrorOpen, setIsMirrorOpen] = useState(false);

    // Data for Mirror Chat
    const [bible, setBible] = useState<CharacterBible | null>(null);

    useEffect(() => {
        if (!user) return;
        const unsubscribe = subscribeToCharacterProfile(user.uid, (data) => {
            setBible(data.character_bible);
        });
        return () => unsubscribe();
    }, [user]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (isFabMenuOpen && !target.closest('.fab-container')) {
                setIsFabMenuOpen(false);
            }
        };

        if (isFabMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isFabMenuOpen]);


    // --- RENDER ---
    return (
        <>
            {/* FAB CONTAINER (Fixed Bottom Center) */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 fab-container flex flex-col items-center">

                {/* ACTION MENU POP-UP */}
                <div
                    className={cn(
                        "absolute bottom-20 flex flex-col gap-3 w-64 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-3xl p-3 shadow-2xl transition-all duration-300 origin-bottom",
                        isFabMenuOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4 pointer-events-none"
                    )}
                >
                    <button
                        onClick={() => {
                            setIsFabMenuOpen(false);
                            setIsCheckInOpen(true);
                        }}
                        className="flex items-center gap-4 w-full p-4 rounded-2xl hover:bg-zinc-800 transition-colors group text-left"
                    >
                        <div className="w-10 h-10 rounded-full bg-blue-950/50 border border-blue-900/50 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                            <Target className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-white font-bold text-sm mb-0.5">Daily Check-In</div>
                            <div className="text-zinc-500 text-xs line-clamp-1">Get your daily counsel and action plan.</div>
                        </div>
                    </button>

                    <button
                        onClick={() => {
                            setIsFabMenuOpen(false);
                            setIsMirrorOpen(true);
                        }}
                        className="flex items-center gap-4 w-full p-4 rounded-2xl hover:bg-zinc-800 transition-colors group text-left"
                    >
                        <div className="w-10 h-10 rounded-full bg-emerald-950/50 border border-emerald-900/50 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                            <MessageCircle className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-white font-bold text-sm mb-0.5">The Mirror</div>
                            <div className="text-zinc-500 text-xs line-clamp-1">Free-flowing chat with your Ideal Self.</div>
                        </div>
                    </button>
                </div>

                {/* MAIN FAB BUTTON */}
                <button
                    onClick={() => setIsFabMenuOpen(!isFabMenuOpen)}
                    className={cn(
                        "w-16 h-16 rounded-full bg-white text-black shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex items-center justify-center transition-all duration-300 ring-4 ring-black",
                        isFabMenuOpen ? "rotate-45 scale-110" : "hover:scale-110 active:scale-95"
                    )}
                >
                    <Plus className="w-8 h-8" />
                </button>
            </div>

            {/* BACKDROP BLUR FOR MENU */}
            {isFabMenuOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={() => setIsFabMenuOpen(false)}
                />
            )}

            {/* MODALS */}
            {isCheckInOpen && (
                <CheckInWizardModal
                    isOpen={true}
                    onClose={() => setIsCheckInOpen(false)}
                />
            )}

            <MirrorChat
                isOpen={isMirrorOpen}
                onClose={() => setIsMirrorOpen(false)}
                bible={bible}
                uid={user?.uid || ""}
            />
        </>
    );
}
