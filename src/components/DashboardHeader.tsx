// This component was extracted from page.tsx to resolve duplication issues.
"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterProfile } from "@/types/character";
import { Bell } from "lucide-react";

import { ActiveMission } from "@/components/ActiveMission";
import { DirectivesMenu } from "@/components/DirectivesMenu";

export function DashboardHeader() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isDirectivesOpen, setIsDirectivesOpen] = useState(false);
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const { user } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!user) return;
        const unsub = subscribeToCharacterProfile(user.uid, (p) => {
            setProfile(p);
        });
        return () => unsub();
    }, [user]);

    const incompleteCount = profile?.active_todos?.filter(t => !t.completed).length || 0;

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push('/login');
        } catch (error) {
            console.error("Error signing out: ", error);
        }
    };

    return (
        <>
            <header className="fixed top-0 w-full z-50 bg-zinc-950/90 backdrop-blur-md border-b border-white/10 pointer-events-none pt-safe">
                {/* Navbar */}
                <nav className="w-full relative">
                    <div className="container mx-auto flex justify-between items-center w-full px-4 py-3">
                        {/* Brand - Cinematic Minimal */}
                        <Link href="/" className="pointer-events-auto text-sm font-bold tracking-widest uppercase flex items-center gap-1 hover:opacity-80 transition-opacity text-white">
                            Earnest Page
                        </Link>

                        {/* Right Side Actions */}
                        <div className="relative flex items-center gap-2 pointer-events-auto">
                            {/* Directives Toggle */}
                            <button
                                onClick={() => setIsDirectivesOpen(true)}
                                className="relative p-2 text-zinc-400 hover:text-white transition-colors rounded-full"
                            >
                                <Bell className="w-6 h-6" />
                                {incompleteCount > 0 && (
                                    <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                                        {incompleteCount}
                                    </span>
                                )}
                            </button>

                            {/* Hamburger / Menu */}
                            <div className="relative">
                                <button
                                    className="p-2 text-white hover:bg-zinc-800 rounded-none transition-colors"
                                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                                >
                                    <div className="space-y-1.5">
                                        <span className="block w-6 h-0.5 bg-current"></span>
                                        <span className="block w-6 h-0.5 bg-current"></span>
                                        <span className="block w-6 h-0.5 bg-current"></span>
                                    </div>
                                </button>

                                {/* Dropdown Menu */}
                                {isMenuOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-800 shadow-2xl z-50">
                                        <ul className="py-0">
                                            <li className="px-4 py-3 text-[10px] font-bold text-zinc-500 bg-zinc-950 uppercase tracking-widest mb-0 border-b border-zinc-800">
                                                Menu
                                            </li>
                                            <li>
                                                <button
                                                    onClick={handleLogout}
                                                    className="block w-full text-left px-4 py-3 text-xs text-red-400 hover:bg-zinc-800 font-bold uppercase tracking-widest transition-colors"
                                                >
                                                    Logout
                                                </button>
                                            </li>
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </nav>

                {/* Active Mission Bar - Integrated Sub-Header */}
                <div className="pointer-events-auto">
                    <ActiveMission />
                </div>

            </header>

            <DirectivesMenu
                isOpen={isDirectivesOpen}
                onClose={() => setIsDirectivesOpen(false)}
                profile={profile}
            />
        </>
    );
}
