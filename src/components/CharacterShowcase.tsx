"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { subscribeToCharacterProfile, updateCharacterProfile } from "@/lib/firebase/character";
import { CharacterBible, CharacterProfile, CharacterIdentity } from "@/types/character";
import { cn } from "@/lib/utils";
import { User, Sparkles, ChevronDown, Pencil, FileText, Loader2, ArrowRight, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { MirrorChat } from "./MirrorChat";
import { DossierView } from "./DossierView";
import { parseMarkdownToSections } from "@/lib/utils/parseContent";

export function CharacterShowcase() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const [bible, setBible] = useState<CharacterBible | null>(null);
    const [identity, setIdentity] = useState<CharacterIdentity | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDossierOpen, setIsDossierOpen] = useState(false);
    const [expandedSection, setExpandedSection] = useState<number | null>(null);
    const [expandedNestedSection, setExpandedNestedSection] = useState<number | null>(null);

    useEffect(() => {
        if (!user) return;
        setLoading(true);

        const unsubscribe = subscribeToCharacterProfile(user.uid, (data) => {
            setProfile(data);
            setBible(data.character_bible);
            setIdentity(data.identity || null);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    if (loading) return <div className="h-48 w-full animate-pulse bg-zinc-900/50 rounded-xl mb-6" />;
    if (!bible && !identity) return null;

    const displayTitle = identity?.title || bible?.source_code?.archetype || "Unknown Character";
    const displaySections = bible?.compiled_output?.ideal;

    return (
        <>
            <div className="w-full mb-8 space-y-6">
                {/* HEAD PROFILE & ACTIONS */}
                <div className="flex items-center justify-between pb-6 border-b border-white/5">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-zinc-800 border-2 border-zinc-700 overflow-hidden shrink-0">
                            {bible?.compiled_bible?.avatar_url ? (
                                <img src={bible.compiled_bible.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-500">
                                    <User className="w-6 h-6" />
                                </div>
                            )}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white mb-0.5 capitalize">
                                {displayTitle}
                            </h2>
                            <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">
                                Profile
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {identity?.dossier && (
                            <button
                                onClick={() => setIsDossierOpen(true)}
                                className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1.5 transition-all"
                            >
                                <FileText className="w-3.5 h-3.5" />
                                Dossier
                            </button>
                        )}
                        <button
                            onClick={() => setIsEditOpen(true)}
                            className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold px-4 py-2 rounded-full flex items-center gap-2 transition-all shadow-sm"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                        </button>
                    </div>
                </div>

                {/* DREAM SELF (shown when no compiled bible yet) */}
                {identity?.dream_self && (!displaySections || displaySections.length === 0) && (
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-bold mb-3">Identity</p>
                        <p className="text-sm text-zinc-300 leading-relaxed">{identity.dream_self}</p>
                    </div>
                )}

                {/* ACCORDION VAULT (compiled bible sections) */}
                {displaySections && displaySections.length > 0 && (
                    <div className="space-y-3">
                        {displaySections.map((section: any, i: number) => {
                            const isOpen = expandedSection === i;
                            return (
                                <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden transition-all duration-200">
                                    <button
                                        onClick={() => {
                                            setExpandedSection(isOpen ? null : i);
                                            setExpandedNestedSection(null);
                                        }}
                                        className="w-full flex items-center justify-between p-4 text-left focus:outline-none hover:bg-zinc-900/80 transition-colors"
                                    >
                                        <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">{section.heading}</h3>
                                        <ChevronDown className={cn("w-5 h-5 text-zinc-500 transition-transform duration-200", isOpen && "rotate-180 text-emerald-500")} />
                                    </button>
                                    {isOpen && (
                                        <div className="p-4 border-t border-zinc-800/50 bg-zinc-950/50 space-y-2">
                                            {parseMarkdownToSections(section.content).map((subSection, j) => {
                                                const isNestedOpen = expandedNestedSection === j;
                                                return (
                                                    <div key={j} className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg overflow-hidden transition-all duration-200">
                                                        <button
                                                            onClick={() => setExpandedNestedSection(isNestedOpen ? null : j)}
                                                            className="w-full flex items-center justify-between p-3 text-left focus:outline-none hover:bg-zinc-800/50 transition-colors"
                                                        >
                                                            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{subSection.subHeading}</h4>
                                                            <ChevronDown className={cn("w-4 h-4 text-zinc-500 transition-transform duration-200", isNestedOpen && "rotate-180 text-emerald-500")} />
                                                        </button>
                                                        {isNestedOpen && (
                                                            <div className="p-4 border-t border-zinc-700/50 bg-black/20">
                                                                <div className="text-sm text-zinc-300 leading-relaxed prose prose-invert prose-sm max-w-none prose-a:text-emerald-400 prose-strong:text-emerald-300">
                                                                    <ReactMarkdown>{subSection.body}</ReactMarkdown>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Edit Modal — Rant-based flow */}
            <EditIdentityModal
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                currentRant={identity?.dream_rant || ""}
                currentGender={identity?.gender || ""}
                currentAge={identity?.age || ""}
            />

            {/* Dossier Modal */}
            {identity && (
                <DossierView
                    identity={identity}
                    isOpen={isDossierOpen}
                    onClose={() => setIsDossierOpen(false)}
                />
            )}
        </>
    );
}

// ——— Edit Identity Modal (Rant → Process → Generate) ———

function EditIdentityModal({ isOpen, onClose, currentRant, currentGender, currentAge }: { isOpen: boolean; onClose: () => void; currentRant: string; currentGender: string; currentAge: string }) {
    const { user } = useAuth();
    const [step, setStep] = useState<'EDIT' | 'PROCESSING' | 'REVEAL'>('EDIT');
    const [gender, setGender] = useState(currentGender || '');
    const [age, setAge] = useState(currentAge || '');
    const [rant, setRant] = useState(currentRant);
    const [result, setResult] = useState<{ title: string; dream_self: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Reset when modal opens
    React.useEffect(() => {
        if (isOpen) {
            setGender(currentGender);
            setAge(currentAge);
            setRant(currentRant);
            setStep('EDIT');
            setResult(null);
            setError(null);
        }
    }, [isOpen, currentRant, currentGender, currentAge]);

    if (!isOpen) return null;

    const handleProcess = async () => {
        if (!rant.trim() || !gender.trim() || !user) return;
        setStep('PROCESSING');
        setError(null);

        try {
            const res = await fetch('/api/onboarding/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: user.uid, rant: rant.trim(), gender: gender.trim(), age: age.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || data.error || 'Processing failed.');
            setResult({ title: data.title, dream_self: data.dream_self });
            setStep('REVEAL');
        } catch (err: any) {
            setError(err.message || 'Something went wrong.');
            setStep('EDIT');
        }
    };

    const handleAcceptAndCompile = async () => {
        if (!user || !result) return;
        setStep('PROCESSING');
        try {
            const res = await fetch('/api/character/compile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: user.uid,
                    source_code: {
                        archetype: result.title,
                        manifesto: result.dream_self,
                        core_beliefs: '',
                        important_people: '',
                        current_constraints: '',
                        things_i_enjoy: '',
                    },
                }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || data.error || 'Compilation failed.');
            }
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to generate character.');
            setStep('REVEAL');
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={step === 'PROCESSING' ? undefined : onClose} />

            <div className="relative w-full max-w-lg max-h-[85vh] bg-zinc-950 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="shrink-0 border-b border-white/5 px-6 py-4 bg-zinc-900/50 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-zinc-200">Edit Identity</h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">
                        Close
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {step === 'EDIT' && (
                        <div className="flex flex-col gap-5">
                            <p className="text-sm text-zinc-500 leading-relaxed">
                                Update your dream. Write as the person you want to be — present tense, no limits.
                            </p>
                            {error && (
                                <div className="text-red-400 text-xs font-medium p-3 bg-red-500/10 border border-red-500/20 rounded-xl">{error}</div>
                            )}
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-bold mb-1.5 block">I am a</label>
                                    <input
                                        type="text"
                                        value={gender}
                                        onChange={(e) => setGender(e.target.value)}
                                        placeholder="Man, Woman, etc."
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-700 focus:border-zinc-600 focus:outline-none"
                                    />
                                </div>
                                <div className="w-24">
                                    <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-bold mb-1.5 block">Age</label>
                                    <input
                                        type="text"
                                        value={age}
                                        onChange={(e) => setAge(e.target.value)}
                                        placeholder="35"
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder-zinc-700 focus:border-zinc-600 focus:outline-none"
                                    />
                                </div>
                            </div>
                            <textarea
                                value={rant}
                                onChange={(e) => setRant(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-5 text-base text-zinc-200 placeholder-zinc-700 focus:border-zinc-600 focus:outline-none min-h-[200px] resize-none leading-relaxed"
                                autoFocus
                            />
                            <button
                                onClick={handleProcess}
                                disabled={!rant.trim() || !gender.trim()}
                                className="w-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 transition-colors disabled:opacity-30 flex items-center justify-center gap-2"
                            >
                                Regenerate Identity <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {step === 'PROCESSING' && (
                        <div className="flex flex-col items-center gap-6 py-12">
                            <Sparkles className="w-10 h-10 text-emerald-500 animate-pulse" />
                            <p className="text-sm text-zinc-500">Reprocessing your identity...</p>
                            <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
                        </div>
                    )}

                    {step === 'REVEAL' && result && (
                        <div className="flex flex-col gap-6">
                            <div className="text-center">
                                <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-600 mb-2">New Title</p>
                                <h2 className="text-2xl font-black text-white">{result.title}</h2>
                            </div>
                            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5">
                                <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-600 mb-2">Identity</p>
                                <p className="text-sm text-zinc-300 leading-relaxed">{result.dream_self}</p>
                            </div>
                            {error && (
                                <div className="text-red-400 text-xs font-medium p-3 bg-red-500/10 border border-red-500/20 rounded-xl">{error}</div>
                            )}
                            <button
                                onClick={handleAcceptAndCompile}
                                className="w-full bg-white text-black py-3.5 text-sm font-bold tracking-wide hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
                            >
                                <Sparkles className="w-4 h-4" /> Accept & Regenerate Character
                            </button>
                            <button
                                onClick={() => setStep('EDIT')}
                                className="w-full border border-zinc-800 py-3 text-sm text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2"
                            >
                                <RotateCcw className="w-3 h-3" /> Edit Again
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
