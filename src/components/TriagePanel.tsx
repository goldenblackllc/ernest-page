"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils";
import { MessageCircle, Home, User as UserIcon, BookOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterBible } from "@/types/character";
import { MirrorChat } from "./MirrorChat";

export function TriagePanel() {
    const { user } = useAuth();
    const pathname = usePathname();

    const [isMirrorOpen, setIsMirrorOpen] = useState(false);
    const [initialContext, setInitialContext] = useState<string | null>(null);

    // Data for Mirror Chat
    const [bible, setBible] = useState<CharacterBible | null>(null);
    const [defaultPostRouting, setDefaultPostRouting] = useState<'public' | 'private'>('public');

    useEffect(() => {
        if (!user) return;
        const unsubscribe = subscribeToCharacterProfile(user.uid, (data) => {
            setBible(data.character_bible);
            setDefaultPostRouting(data.default_post_routing || 'public');
        });
        return () => unsubscribe();
    }, [user]);



    return (
        <>
            {/* BOTTOM NAV BAR */}
            <div className="fixed bottom-0 left-0 w-full z-40 bg-black/90 backdrop-blur-md border-t border-zinc-800 pb-safe">
                <div className="max-w-md mx-auto px-8 h-16 flex items-center justify-between relative">
                    <Link href="/" className={cn("p-2 transition-colors", pathname === "/" ? "text-white" : "text-zinc-500 hover:text-white")}>
                        <Home className="w-6 h-6" />
                    </Link>
                    <Link href="/my-posts" className={cn("p-2 transition-colors", pathname === "/my-posts" ? "text-white" : "text-zinc-500 hover:text-white")}>
                        <BookOpen className="w-6 h-6" />
                    </Link>
                    {/* Spacer for center FAB */}
                    <div className="w-16" />
                    <Link href="/profile" className={cn("p-2 transition-colors", pathname === "/profile" ? "text-white" : "text-zinc-500 hover:text-white")}>
                        <UserIcon className="w-6 h-6" />
                    </Link>
                </div>
            </div>

            {/* FAB — Opens Mirror Chat directly */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center">
                <button
                    onClick={() => bible?.status !== 'compiling' && setIsMirrorOpen(true)}
                    disabled={bible?.status === 'compiling'}
                    className={cn(
                        "w-16 h-16 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex items-center justify-center transition-all duration-300 ring-4 ring-black",
                        bible?.status === 'compiling'
                            ? "bg-zinc-700 text-zinc-500 cursor-not-allowed opacity-60"
                            : "bg-white text-black hover:scale-110 active:scale-95"
                    )}
                    title={bible?.status === 'compiling' ? 'Compiling your Blueprint...' : 'Open chat'}
                >
                    <MessageCircle className={cn("w-7 h-7", bible?.status === 'compiling' && "animate-pulse")} />
                </button>
            </div>

            {/* Mirror Chat Modal */}
            <MirrorChat
                isOpen={isMirrorOpen}
                onClose={() => { setIsMirrorOpen(false); setInitialContext(null); }}
                bible={bible}
                uid={user?.uid || ""}
                initialContext={initialContext}
                defaultPostRouting={defaultPostRouting}
            />
        </>
    );
}
