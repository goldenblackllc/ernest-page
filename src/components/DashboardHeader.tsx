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
import { Bell, Shield, CreditCard, LogOut, Users, HelpCircle, Mail } from "lucide-react";

import { DirectivesMenu } from "@/components/DirectivesMenu";
import { RolodexModal } from "@/components/RolodexModal";
import { SupportChat } from "@/components/SupportChat";

export function DashboardHeader() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isDirectivesOpen, setIsDirectivesOpen] = useState(false);
    const [isRolodexOpen, setIsRolodexOpen] = useState(false);
    const [isSupportOpen, setIsSupportOpen] = useState(false);
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
    const sub = profile?.subscription;
    const hasActivePlan = sub && sub.status === 'active';


    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push('/');
        } catch (error) {
            console.error("Error signing out: ", error);
        }
    };

    return (
        <>
            <header className="fixed top-0 w-full z-50 bg-zinc-950/90 backdrop-blur-md border-b border-white/10 pointer-events-none pt-safe">
                <nav className="w-full relative">
                    <div className="container mx-auto flex justify-between items-center w-full px-4 py-3">
                        {/* Brand */}
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
                                    className="relative p-2 text-white hover:bg-zinc-800 rounded-none transition-colors"
                                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                                >
                                    <div className="space-y-1.5">
                                        <span className="block w-6 h-0.5 bg-current"></span>
                                        <span className="block w-6 h-0.5 bg-current"></span>
                                        <span className="block w-6 h-0.5 bg-current"></span>
                                    </div>
                            </button>

                                {isMenuOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-64 bg-zinc-950/90 backdrop-blur-md border border-zinc-800 shadow-2xl shadow-black/50 rounded-xl overflow-hidden z-50">

                                        {/* Security Vault */}
                                        <button
                                            onClick={() => {
                                                setIsMenuOpen(false);
                                                router.push('/profile');
                                                setTimeout(() => { window.location.hash = 'vault'; }, 100);
                                            }}
                                            className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800/50 transition-colors"
                                        >
                                            <Shield className="w-4 h-4 text-zinc-500" />
                                            Security Vault
                                        </button>

                                        {/* Rolodex */}
                                        <button
                                            onClick={() => {
                                                setIsMenuOpen(false);
                                                setIsRolodexOpen(true);
                                            }}
                                            className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800/50 transition-colors"
                                        >
                                            <Users className="w-4 h-4 text-zinc-500" />
                                            Rolodex
                                        </button>

                                        {/* Subscription */}
                                        <button
                                            onClick={() => {
                                                setIsMenuOpen(false);
                                                router.push('/subscription');
                                            }}
                                            className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800/50 transition-colors"
                                        >
                                            <CreditCard className="w-4 h-4 text-zinc-500" />
                                            Billing & Sessions
                                        </button>

                                        {/* Log Out */}
                                        <button
                                            onClick={handleLogout}
                                            className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm font-medium text-red-500/80 hover:bg-zinc-800/50 transition-colors"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            Log Out
                                        </button>

                                        {/* Divider */}
                                        <div className="border-t border-zinc-800/50 my-1" />

                                        {/* Support */}
                                        <button
                                            onClick={() => {
                                                setIsMenuOpen(false);
                                                setIsSupportOpen(true);
                                            }}
                                            className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm font-medium text-zinc-400 hover:bg-zinc-800/50 transition-colors"
                                        >
                                            <HelpCircle className="w-4 h-4 text-zinc-500" />
                                            Support
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </nav>
            </header>

            <DirectivesMenu
                isOpen={isDirectivesOpen}
                onClose={() => setIsDirectivesOpen(false)}
                profile={profile}
            />

            <RolodexModal
                isOpen={isRolodexOpen}
                onClose={() => setIsRolodexOpen(false)}
                profile={profile}
            />

            <SupportChat
                isOpen={isSupportOpen}
                onClose={() => setIsSupportOpen(false)}
            />
        </>
    );
}
