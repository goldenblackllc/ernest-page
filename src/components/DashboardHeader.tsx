// This component was extracted from page.tsx to resolve duplication issues.
"use client";

import { useState, useEffect } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/context/AuthContext";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterProfile } from "@/types/character";
import { Shield, LogOut, Users, HelpCircle, CreditCard } from "lucide-react";
import { useTranslations } from 'next-intl';

import { RolodexModal } from "@/components/RolodexModal";
import { SupportChat } from "@/components/SupportChat";
import { SecurityVault } from "@/components/SecurityVault";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { BetaMarker } from "@/components/BetaMarker";

export function DashboardHeader() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isRolodexOpen, setIsRolodexOpen] = useState(false);
    const [isSupportOpen, setIsSupportOpen] = useState(false);
    const [isVaultOpen, setIsVaultOpen] = useState(false);
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const { user, signOut } = useAuth();
    const router = useRouter();
    const t = useTranslations();

    useEffect(() => {
        if (!user) return;
        const unsub = subscribeToCharacterProfile(user.uid, (p) => {
            setProfile(p);
        });
        return () => unsub();
    }, [user]);

    const handleLogout = async () => {
        try {
            await signOut();
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
                        <div className="flex items-center gap-2">
                            <Link href="/" className="pointer-events-auto text-sm font-bold tracking-widest uppercase flex items-center gap-1 hover:opacity-80 transition-opacity text-white">
                                {t('common.brand')}
                            </Link>
                            <BetaMarker />
                        </div>

                        {/* Right Side Actions */}
                        <div className="relative flex items-center gap-2 pointer-events-auto">
                            <LocaleSwitcher className="w-20 hidden sm:flex mr-1" />
                            
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
                                                setIsVaultOpen(true);
                                            }}
                                            className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800/50 transition-colors"
                                        >
                                            <Shield className="w-4 h-4 text-zinc-500" />
                                            {t('dashboard.header.securityVault')}
                                        </button>

                                        {/* Billing: balance, membership, cards, history, refunds */}
                                        <button
                                            onClick={() => {
                                                setIsMenuOpen(false);
                                                router.push('/billing');
                                            }}
                                            className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800/50 transition-colors"
                                        >
                                            <CreditCard className="w-4 h-4 text-zinc-500" />
                                            {t('dashboard.header.billing')}
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
                                            {t('dashboard.header.rolodex')}
                                        </button>



                                        {/* Log Out */}
                                        <button
                                            onClick={handleLogout}
                                            className="flex items-center gap-3 w-full text-left px-4 py-3 text-sm font-medium text-red-500/80 hover:bg-zinc-800/50 transition-colors"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            {t('dashboard.header.logOut')}
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
                                            {t('dashboard.header.support')}
                                        </button>
                                        
                                        {/* Mobile Locale Switcher inside menu */}
                                        <div className="sm:hidden border-t border-zinc-800/50 my-1" />
                                        <div className="sm:hidden px-4 py-2">
                                            <LocaleSwitcher className="w-full bg-transparent border-none" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </nav>
            </header>

            <RolodexModal
                isOpen={isRolodexOpen}
                onClose={() => setIsRolodexOpen(false)}
                profile={profile}
            />

            <SupportChat
                isOpen={isSupportOpen}
                onClose={() => setIsSupportOpen(false)}
            />

            <SecurityVault
                isOpen={isVaultOpen}
                onClose={() => setIsVaultOpen(false)}
                profile={profile}
            />
        </>
    );
}
