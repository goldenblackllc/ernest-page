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

export function ProfileView() {
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
                            {bible?.compiled_output?.avatar_url ? (
                                <img src={bible.compiled_output.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
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

                {/* IDENTITY VISION (shown when no compiled bible yet) */}
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
                currentPeople={identity?.important_people || ""}
                currentEnjoyments={identity?.things_i_enjoy || ""}
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

function EditIdentityModal({ isOpen, onClose, currentRant, currentGender, currentAge, currentPeople, currentEnjoyments }: { isOpen: boolean; onClose: () => void; currentRant: string; currentGender: string; currentAge: string; currentPeople: string; currentEnjoyments: string }) {
    const { user } = useAuth();
    const [step, setStep] = useState<'EDIT' | 'PROCESSING' | 'REVEAL'>('EDIT');
    const [gender, setGender] = useState(currentGender || '');
    const [age, setAge] = useState(currentAge || '');
    const [rant, setRant] = useState(currentRant);
    const [people, setPeople] = useState(currentPeople || '');
    const [enjoyments, setEnjoyments] = useState(currentEnjoyments || '');
    const [result, setResult] = useState<{ title: string; dream_self: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Only reset when modal actually opens (false → true), not when Firestore props change mid-flow
    const wasOpen = React.useRef(false);
    React.useEffect(() => {
        if (isOpen && !wasOpen.current) {
            // Modal just opened — populate with current values
            setGender(currentGender);
            setAge(currentAge);
            setRant(currentRant);
            setPeople(currentPeople);
            setEnjoyments(currentEnjoyments);
            setStep('EDIT');
            setResult(null);
            setError(null);
        }
        wasOpen.current = isOpen;
    }, [isOpen, currentRant, currentGender, currentAge, currentPeople, currentEnjoyments]);

    if (!isOpen) return null;

    const handleProcess = async () => {
        if (!rant.trim() || !gender.trim() || !user) return;
        setStep('PROCESSING');
        setError(null);

        try {
            const res = await fetch('/api/onboarding/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: user.uid,
                    rant: rant.trim(),
                    gender: gender.trim(),
                    age: age.trim(),
                    important_people: people.trim(),
                    things_i_enjoy: enjoyments.trim(),
                }),
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
                        important_people: people.trim(),
                        things_i_enjoy: enjoyments.trim(),
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

            <div className="relative w-full max-w-lg max-h-[85vh] bg-zinc-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="shrink-0 border-b border-white/5 px-6 py-4 bg-zinc-900/50 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-white">Edit Identity</h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-sm font-semibold py-2 px-3">
                        Close
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {step === 'EDIT' && (
                        <div className="flex flex-col gap-5">
                            <p className="text-sm text-zinc-500 leading-relaxed">
                                Define your baseline. Be brutally honest.
                            </p>
                            {error && (
                                <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-xl">{error}</div>
                            )}
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">I am a</label>
                                    <input
                                        type="text"
                                        value={gender}
                                        onChange={(e) => setGender(e.target.value)}
                                        placeholder="Man, Woman, etc."
                                        className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                                    />
                                </div>
                                <div className="w-24">
                                    <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Age</label>
                                    <input
                                        type="text"
                                        value={age}
                                        onChange={(e) => setAge(e.target.value)}
                                        placeholder="35"
                                        className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                                    />
                                </div>
                            </div>

                            {/* Input 1: The Vision */}
                            <div>
                                <label className="text-xs text-white font-semibold mb-1 block">The Vision</label>
                                <p className="text-[11px] text-zinc-500 mb-2 leading-relaxed">Describe the person you want to be. Don&apos;t worry about formatting—just get your thoughts down. We will translate this into your official blueprint.</p>
                                <textarea
                                    value={rant}
                                    onChange={(e) => setRant(e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30 min-h-[140px] resize-none leading-relaxed"
                                    autoFocus
                                />
                            </div>

                            {/* Input 2: Key People */}
                            <div>
                                <label className="text-xs text-white font-semibold mb-1 block">Key People</label>
                                <p className="text-[11px] text-zinc-500 mb-2 leading-relaxed">Who is in your daily orbit? List family, friends, or anyone causing friction.</p>
                                <textarea
                                    value={people}
                                    onChange={(e) => setPeople(e.target.value)}
                                    placeholder="e.g., Iris (Wife), Sage & Brian (Kids), Sky & Dug (Dogs), or my manager..."
                                    className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30 min-h-[120px] resize-y leading-relaxed"
                                />
                            </div>

                            {/* Input 3: What You Love */}
                            <div>
                                <label className="text-xs text-white font-semibold mb-1 block">What You Love</label>
                                <p className="text-[11px] text-zinc-500 mb-2 leading-relaxed">What brings you joy? List your favorite foods, media, or unchanging preferences. Your ideal self is still you.</p>
                                <textarea
                                    value={enjoyments}
                                    onChange={(e) => setEnjoyments(e.target.value)}
                                    placeholder="e.g., Carnivore diet, action movies, eating cookies, organizing my space..."
                                    className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30 min-h-[120px] resize-y leading-relaxed"
                                />
                            </div>

                            <button
                                onClick={handleProcess}
                                disabled={!rant.trim() || !gender.trim()}
                                className="w-full bg-white text-black py-3.5 text-sm font-bold rounded-xl hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 flex items-center justify-center gap-2"
                            >
                                Lock In Blueprint <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {step === 'PROCESSING' && (
                        <div className="flex flex-col items-center gap-6 py-12">
                            <Sparkles className="w-10 h-10 text-emerald-500 animate-pulse" />
                            <p className="text-base text-zinc-400">Rebuilding your identity...</p>
                            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                        </div>
                    )}

                    {step === 'REVEAL' && result && (
                        <div className="flex flex-col gap-6">
                            <div className="text-center">
                                <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">New Title</p>
                                <h2 className="text-2xl font-black text-white">{result.title}</h2>
                            </div>
                            <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-5">
                                <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">Identity</p>
                                <p className="text-base text-zinc-300 leading-relaxed">{result.dream_self}</p>
                            </div>
                            {error && (
                                <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-xl">{error}</div>
                            )}
                            <button
                                onClick={handleAcceptAndCompile}
                                className="w-full bg-white text-black py-3.5 text-sm font-bold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
                            >
                                <Sparkles className="w-4 h-4" /> Accept & Rebuild Character
                            </button>
                            <button
                                onClick={() => setStep('EDIT')}
                                className="w-full border border-zinc-800 py-3 text-sm text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors flex items-center justify-center gap-2"
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

