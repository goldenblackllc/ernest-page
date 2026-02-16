"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { subscribeToCharacterBible } from "@/lib/firebase/character";
import { CharacterBible } from "@/types/character";
import { cn } from "@/lib/utils";
import { User, Scroll, Target, Crown, Sparkles } from "lucide-react";
import { CharacterSheetModal } from "./CharacterSheetModal";

export function CharacterShowcase() {
    const { user } = useAuth();
    const [bible, setBible] = useState<CharacterBible | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSheetOpen, setIsSheetOpen] = useState(false);

    useEffect(() => {
        if (!user) return;
        setLoading(true);

        // Real-time subscription
        const unsubscribe = subscribeToCharacterBible(user.uid, (data) => {
            setBible(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    if (loading) return <div className="h-48 w-full animate-pulse bg-zinc-900/50 rounded-xl mb-6" />;
    if (!bible) return null;

    // Helper to get background image style if available for a label
    const getVisual = (label: string) => {
        const visual = bible.visual_board.find(v => v.label.toLowerCase().includes(label.toLowerCase()));
        return visual ? { backgroundImage: `url(${visual.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {};
    };

    return (
        <>
            <div className="w-full mb-8 space-y-4">
                <h2 className="px-1 text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                    <Crown className="w-4 h-4 text-emerald-500" />
                    Character Engine
                </h2>

                {/* Carousel Container */}
                <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory no-scrollbar text-white">

                    {/* CARD 1: IDENTITY (The "Profile" Card) */}
                    <button
                        onClick={() => setIsSheetOpen(true)}
                        className="snap-center shrink-0 w-[85vw] sm:w-80 h-96 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 flex flex-col justify-between relative overflow-hidden group transition-all hover:border-zinc-500 text-left"
                        style={getVisual('identity')}
                    >
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

                        <div className="relative z-10">
                            <div className="w-12 h-12 rounded-full bg-zinc-800 border-2 border-zinc-700 mb-4 overflow-hidden">
                                {bible.avatar_url ? (
                                    <img src={bible.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-500">
                                        <User className="w-6 h-6" />
                                    </div>
                                )}
                            </div>
                            <h3 className="text-2xl font-black uppercase tracking-tighter text-white leading-none mb-2">
                                {bible.title}
                            </h3>
                            <p className="text-sm font-serif text-zinc-300 leading-relaxed opacity-90">
                                "{bible.summary}"
                            </p>
                        </div>

                        <div className="relative z-10 pt-4 border-t border-white/10">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Archetype</div>
                            <div className="text-xs font-bold text-emerald-400">ACTIVE PROTAGONIST</div>
                        </div>
                    </button>

                    {/* CARD 2: BELIEFS (The "Code") */}
                    <button
                        onClick={() => setIsSheetOpen(true)}
                        className="snap-center shrink-0 w-[85vw] sm:w-80 h-96 rounded-2xl bg-zinc-950 border border-zinc-800 p-6 flex flex-col relative overflow-hidden group text-left hover:border-zinc-500 transition-colors"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Scroll className="w-24 h-24 text-white" />
                        </div>

                        <div className="mb-6 relative z-10">
                            <h3 className="text-lg font-black uppercase tracking-widest text-zinc-500 mb-1">Core Beliefs</h3>
                            <div className="h-1 w-12 bg-emerald-500 rounded-full" />
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3 relative z-10 pr-2 custom-scrollbar">
                            {bible.core_beliefs.length > 0 ? bible.core_beliefs.map((belief, i) => (
                                <div key={i} className="text-sm font-serif text-zinc-300 border-l-2 border-zinc-800 pl-3 py-1">
                                    {belief}
                                </div>
                            )) : (
                                <div className="text-sm text-zinc-600 italic">No core beliefs installed yet.</div>
                            )}
                        </div>
                    </button>

                    {/* CARD 3: RULES (The "Operating System") */}
                    <button
                        onClick={() => setIsSheetOpen(true)}
                        className="snap-center shrink-0 w-[85vw] sm:w-80 h-96 rounded-2xl bg-zinc-950 border border-zinc-800 p-6 flex flex-col relative overflow-hidden group text-left hover:border-zinc-500 transition-colors"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Sparkles className="w-24 h-24 text-white" />
                        </div>

                        <div className="mb-6 relative z-10">
                            <h3 className="text-lg font-black uppercase tracking-widest text-zinc-500 mb-1">Active Rules</h3>
                            <div className="h-1 w-12 bg-blue-500 rounded-full" />
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3 relative z-10 pr-2 custom-scrollbar">
                            {bible.rules.length > 0 ? bible.rules.map((rule, i) => (
                                <div key={i} className="group/rule">
                                    <div className="text-xs font-bold text-blue-400 mb-1 uppercase tracking-wider">{rule.rule}</div>
                                    {rule.description && (
                                        <div className="text-xs text-zinc-500 leading-tight">{rule.description}</div>
                                    )}
                                </div>
                            )) : (
                                <div className="text-sm text-zinc-600 italic">No rules defined.</div>
                            )}
                        </div>
                    </button>

                    {/* CARD 4: GOALS (The "Target") */}
                    <button
                        onClick={() => setIsSheetOpen(true)}
                        className="snap-center shrink-0 w-[85vw] sm:w-80 h-96 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 flex flex-col relative overflow-hidden group text-left hover:border-zinc-500 transition-colors"
                        style={getVisual('goals')}
                    >
                        <div className="absolute inset-0 bg-black/80" />

                        <div className="mb-6 relative z-10">
                            <h3 className="text-lg font-black uppercase tracking-widest text-zinc-500 mb-1">Target State</h3>
                            <div className="h-1 w-12 bg-red-500 rounded-full" />
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-4 relative z-10">
                            {bible.goals.length > 0 ? bible.goals.map((goal, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <Target className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                    <span className="text-sm font-medium text-zinc-200">{goal}</span>
                                </div>
                            )) : (
                                <div className="text-sm text-zinc-600 italic">No targets set.</div>
                            )}
                        </div>
                    </button>

                </div>
            </div>

            <CharacterSheetModal
                isOpen={isSheetOpen}
                onClose={() => {
                    setIsSheetOpen(false);
                }}
                initialData={bible}
            />
        </>
    );
}
