"use client";

import React, { useEffect, useRef } from "react";
import { Globe, Lock, Flame, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils/cn";
import type { SessionRouting } from "@/types/chat";

interface RoutingMenuProps {
    routing: SessionRouting;
    isOpen: boolean;
    setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
    onSelect: (option: SessionRouting) => void;
}

export function RoutingMenu({ routing, isOpen, setIsOpen, onSelect }: RoutingMenuProps) {
    const t = useTranslations();
    const routingRef = useRef<HTMLDivElement>(null);

    // Close routing popover on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (routingRef.current && !routingRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen, setIsOpen]);

    return (
        <div className="flex items-center mb-2" ref={routingRef}>
            <div className="relative">
                <button
                    onClick={() => setIsOpen(prev => !prev)}
                    className={cn(
                        "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border transition-all",
                        routing === 'burn'
                            ? "text-red-400 border-red-800/40 hover:border-red-700/60 bg-red-950/20"
                            : "text-zinc-500 border-zinc-700/50 hover:text-zinc-300 hover:border-zinc-600"
                    )}
                    aria-label={t('mirrorChat.sessionRoutingSettings')}
                >
                    {routing === 'public' && <Globe className="w-3 h-3" />}
                    {routing === 'private' && <Lock className="w-3 h-3" />}
                    {routing === 'burn' && <Flame className="w-3 h-3" />}
                    <span>
                        {routing === 'public' && t('mirrorChat.publicFeed')}
                        {routing === 'private' && t('mirrorChat.privateLedger')}
                        {routing === 'burn' && t('mirrorChat.burnOnClose')}
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                </button>

                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: 4, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.97 }}
                            transition={{ duration: 0.15 }}
                            className="absolute bottom-full left-0 mb-2 z-20 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[220px]"
                        >
                            <div className="px-4 pt-3 pb-1">
                                <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">{t('mirrorChat.sessionRouting')}</p>
                            </div>
                            {(['public', 'private', 'burn'] as SessionRouting[]).map(option => (
                                <button
                                    key={option}
                                    onClick={() => onSelect(option)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                                        routing === option
                                            ? option === 'burn' ? "bg-red-950/40 text-red-400" : "bg-zinc-800 text-white"
                                            : option === 'burn' ? "text-zinc-500 hover:text-red-400 hover:bg-red-950/20" : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                                    )}
                                >
                                    {option === 'public' && <Globe className="w-3.5 h-3.5 shrink-0" />}
                                    {option === 'private' && <Lock className="w-3.5 h-3.5 shrink-0" />}
                                    {option === 'burn' && <Flame className="w-3.5 h-3.5 shrink-0" />}
                                    <span>
                                        {option === 'public' && t('mirrorChat.publicFeed')}
                                        {option === 'private' && t('mirrorChat.privateLedger')}
                                        {option === 'burn' && t('mirrorChat.burnOnClose')}
                                    </span>
                                    {routing === option && <span className="ml-auto text-[10px] text-zinc-500">✓</span>}
                                </button>
                            ))}
                            {/* Burn microcopy */}
                            {routing === 'burn' && (
                                <p className="text-[10px] text-red-500/70 font-medium tracking-wide px-4 pb-3">
                                    {t('mirrorChat.burnMicrocopy')}
                                </p>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
