// This component was extracted from page.tsx to resolve duplication issues.
"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/config";

import { ActiveMission } from "@/components/ActiveMission";

export function DashboardHeader() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const router = useRouter();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push('/login');
        } catch (error) {
            console.error("Error signing out: ", error);
        }
    };

    return (
        <header className="fixed top-0 w-full z-50 bg-zinc-950/90 backdrop-blur-md border-b border-white/10 pointer-events-none">
            {/* Navbar */}
            <nav className="py-6 px-4 relative">
                <div className="container mx-auto flex justify-between items-center">
                    {/* Brand - Cinematic Minimal */}
                    <Link href="/" className="pointer-events-auto text-sm font-bold tracking-widest uppercase flex items-center gap-1 hover:opacity-80 transition-opacity text-white">
                        Earnest Page
                    </Link>

                    {/* Hamburger / Menu */}
                    <div className="relative pointer-events-auto">
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
            </nav>

            {/* Active Mission Bar - Integrated Sub-Header */}
            <div className="pointer-events-auto">
                <ActiveMission />
            </div>
        </header>
    );
}
