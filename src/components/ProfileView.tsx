"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { subscribeToCharacterProfile } from "@/lib/firebase/character";
import { CharacterBible, CharacterProfile, CharacterIdentity } from "@/types/character";
import { cn } from "@/lib/utils";
import { User, ChevronDown, Pencil, FileText, Loader2, Mail } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { DossierView } from "./DossierView";
import { CharacterReview } from "./CharacterReview";
import { parseMarkdownToSections } from "@/lib/utils/parseContent";
import { IdentityForm, IdentityFormData } from "./IdentityForm";

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
    const [selectedReview, setSelectedReview] = useState<any>(null);

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

                {/* LETTERS — Monthly Character Reviews */}
                {identity?.monthly_reviews && identity.monthly_reviews.length > 0 && (
                    <div className="space-y-3">
                        <h3 className="text-xs font-bold tracking-widest uppercase text-zinc-500 flex items-center gap-2">
                            <Mail className="w-3.5 h-3.5" />
                            Letters
                        </h3>
                        {[...identity.monthly_reviews].reverse().map((review: any) => {
                            const monthLabel = (() => {
                                try {
                                    const [year, month] = review.month.split('-');
                                    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                                } catch { return review.month; }
                            })();
                            return (
                                <button
                                    key={review.id}
                                    onClick={() => setSelectedReview(review)}
                                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-left hover:bg-zinc-900/80 transition-colors flex items-center justify-between"
                                >
                                    <div>
                                        <div className="text-sm font-semibold text-zinc-300">{monthLabel}</div>
                                        <div className="text-xs text-zinc-600 mt-0.5">From {displayTitle}</div>
                                    </div>
                                    {!review.read && (
                                        <span className="text-[9px] font-bold tracking-widest uppercase bg-white text-black px-2 py-0.5 rounded-full">
                                            New
                                        </span>
                                    )}
                                </button>
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
                currentEthnicity={identity?.ethnicity || ""}
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

            {/* Character Review Modal */}
            {selectedReview && (
                <CharacterReview
                    review={selectedReview}
                    characterTitle={displayTitle}
                    avatarUrl={bible?.compiled_output?.avatar_url}
                    isOpen={!!selectedReview}
                    onClose={() => setSelectedReview(null)}
                />
            )}
        </>
    );
}

// ——— Edit Identity Modal (Shared Form → Background Generation) ———

function EditIdentityModal({ isOpen, onClose, currentRant, currentGender, currentAge, currentEthnicity, currentPeople, currentEnjoyments }: { isOpen: boolean; onClose: () => void; currentRant: string; currentGender: string; currentAge: string; currentEthnicity: string; currentPeople: string; currentEnjoyments: string }) {
    const { user } = useAuth();
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset when modal opens
    const wasOpen = React.useRef(false);
    React.useEffect(() => {
        if (isOpen && !wasOpen.current) {
            setIsProcessing(false);
            setError(null);
        }
        wasOpen.current = isOpen;
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (data: IdentityFormData) => {
        if (!user) return;
        setIsProcessing(true);
        setError(null);

        try {
            const res = await fetch('/api/onboarding/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: user.uid,
                    rant: data.rant.trim(),
                    gender: data.gender.trim(),
                    age: data.age.trim(),
                    ethnicity: data.ethnicity.trim(),
                    important_people: data.people.trim(),
                    things_i_enjoy: data.enjoyments.trim(),
                }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || result.error || 'Processing failed.');

            // Process API kicks off bible+avatar generation in background.
            // Navigate to dashboard where the status card shows progress.
            onClose();
            window.location.href = '/';
        } catch (err: any) {
            setError(err.message || 'Something went wrong.');
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={isProcessing ? undefined : onClose} />

            <div className="relative w-full max-w-lg max-h-[85vh] bg-zinc-950 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="shrink-0 border-b border-white/5 px-6 py-4 bg-zinc-900/50 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-white">Edit Identity</h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-sm font-semibold py-2 px-3">
                        Close
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {isProcessing ? (
                        <div className="flex flex-col items-center gap-6 py-12">
                            <div className="w-12 h-12 rounded-full border-2 border-zinc-700 border-t-white animate-spin" />
                            <p className="text-base text-zinc-400">Establishing operational baseline...</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-5">
                            {error && (
                                <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-xl">{error}</div>
                            )}
                            <IdentityForm
                                initialValues={{
                                    gender: currentGender,
                                    age: currentAge,
                                    ethnicity: currentEthnicity,
                                    rant: currentRant,
                                    people: currentPeople,
                                    enjoyments: currentEnjoyments,
                                }}
                                onSubmit={handleSubmit}
                                isSubmitting={isProcessing}
                                submitLabel="Rebuild Character"
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
