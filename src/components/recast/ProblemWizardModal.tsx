import React, { useEffect } from 'react';
import { useProblemWizard, Belief } from '@/hooks/useProblemWizard';
import { Button } from '@/components/ui/Button';
import { X, Check, ArrowRight, RefreshCw, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/lib/auth/AuthContext';

interface ProblemWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ProblemWizardModal({ isOpen, onClose }: ProblemWizardModalProps) {
    const {
        state,
        isLoading,
        error,
        setRant,
        generateBeliefs,
        toggleBelief,
        generateThoughts,
        toggleThought,
        generateRules,
        toggleRule,
        generateActions,
        toggleAction,
        regenerateStep,
        nextStep,
        prevStep
    } = useProblemWizard();

    const { user } = useAuth();

    // Prevent scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
        return () => { document.body.style.overflow = 'auto'; };
    }, [isOpen]);

    if (!isOpen) return null;

    // --- FINISH HANDLER ---
    const handleFinish = async () => {
        if (!user) return;

        try {
            const bibleRef = doc(db, 'users', user.uid);

            const newRules = state.selectedRules.map(r => ({
                id: crypto.randomUUID(),
                rule: r,
                description: "Operating Protocol",
                category: 'recast'
            }));

            const newActions = state.selectedActions.map(a => ({
                id: crypto.randomUUID(),
                text: a,
                created_at: Date.now(),
                expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
                is_completed: false
            }));

            await updateDoc(bibleRef, {
                "character_bible.rules": arrayUnion(...newRules),
                "character_bible.thoughts": arrayUnion(...state.selectedThoughts),
                "character_bible.suggested_actions": arrayUnion(...newActions),
                "character_bible.last_updated": Date.now()
            });

            alert("RECAST COMPLETE. SYSTEM UPDATED.");
            onClose();

        } catch (err) {
            console.error("Failed to save recast results:", err);
            alert("Failed to save. Please try again.");
        }
    };


    // --- RENDER STEPS ---

    const renderProgressBar = () => (
        <div className="w-full h-1 bg-zinc-900 mb-6 flex">
            {[1, 2, 3, 4, 5, 6].map(s => (
                <div
                    key={s}
                    className={cn(
                        "h-full flex-1 transition-all duration-500",
                        s <= state.step ? "bg-red-600" : "bg-transparent"
                    )}
                />
            ))}
        </div>
    );

    const renderHeader = (title: string, subtitle?: string) => (
        <div className="mb-8 text-center">
            <h2 className="text-3xl font-black uppercase tracking-tighter text-white mb-2">{title}</h2>
            {subtitle && <p className="text-zinc-400 font-medium tracking-wide text-sm">{subtitle}</p>}
        </div>
    );

    // Dynamic Button Text & Action
    const getButtonProps = () => {
        switch (state.step) {
            case 1:
                return {
                    text: isLoading ? "ANALYZING..." : "NEXT",
                    action: generateBeliefs,
                    disabled: state.rant.length < 10
                };
            case 2:
                // Selection -> View (Next Step)
                return {
                    text: "NEXT",
                    action: nextStep,
                    disabled: state.selectedBeliefs.length === 0
                };
            case 3:
                // View -> API (Generate Thoughts)
                return {
                    text: isLoading ? "GENERATING..." : "NEXT",
                    action: generateThoughts,
                    disabled: false
                };
            case 4:
                return {
                    text: isLoading ? "GENERATING..." : "NEXT",
                    action: generateRules,
                    disabled: state.selectedThoughts.length === 0
                };
            case 5:
                return {
                    text: isLoading ? "GENERATING..." : "NEXT",
                    action: generateActions,
                    disabled: state.selectedRules.length === 0
                };
            case 6:
                return {
                    text: "FINISH & POST",
                    action: handleFinish,
                    disabled: state.selectedActions.length === 0
                };
            default:
                return { text: "NEXT", action: nextStep, disabled: false };
        }
    }

    const { text: buttonText, action: buttonAction, disabled: buttonDisabled } = getButtonProps();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full h-full md:h-auto md:max-w-2xl bg-zinc-950 md:border border-zinc-800 md:shadow-2xl flex flex-col relative max-h-[90vh]">

                {/* TOP BAR */}
                <div className="h-14 border-b border-zinc-900 flex items-center justify-end px-4 shrink-0">
                    {/* (Back Button moved to footer) */}
                    <div className="text-zinc-700 text-xs font-black tracking-widest">
                        STEP {state.step} / 6
                    </div>
                </div>

                {renderProgressBar()}

                {/* CONTENT AREA */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent pb-24">

                    {/* STEP 1: INPUT */}
                    {state.step === 1 && (
                        <div className="animate-in slide-in-from-right-8 duration-300">
                            {renderHeader("What is the Problem?", "Describe the glitch, the failure, or the friction.")}
                            <textarea
                                className="w-full h-64 bg-white/5 border border-zinc-800 text-white text-lg p-6 focus:outline-none focus:border-red-600 resize-none font-serif placeholder:text-zinc-700 rounded-xl"
                                placeholder="I feel stuck because..."
                                value={state.rant}
                                onChange={(e) => setRant(e.target.value)}
                            />
                        </div>
                    )}

                    {/* STEP 2: BELIEFS */}
                    {state.step === 2 && (
                        <div className="animate-in slide-in-from-right-8 duration-300">
                            {renderHeader("CORE BELIEFS", "We found these core negative beliefs. Uncheck any that don't fit.")}
                            <div className="space-y-2">
                                {state.generatedBeliefs.map((belief, i) => {
                                    const isSelected = state.selectedBeliefs.some(b => b.negative === belief.negative);
                                    return (
                                        <div
                                            key={i}
                                            onClick={() => toggleBelief(belief)}
                                            className={cn(
                                                "p-2 border border-zinc-800 bg-zinc-900/50 cursor-pointer flex items-center gap-3 hover:border-zinc-700 transition-colors rounded-lg",
                                                isSelected && "border-red-900/50 bg-red-950/10"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 border flex items-center justify-center shrink-0 rounded-sm",
                                                isSelected ? "bg-red-600 border-red-600 text-white" : "border-zinc-700 bg-transparent"
                                            )}>
                                                {isSelected && <Check className="w-3 h-3" />}
                                            </div>
                                            <p className={cn("text-sm font-serif", isSelected ? "text-red-200" : "text-zinc-500")}>
                                                "{belief.negative}"
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex justify-center mt-4">
                                <button
                                    onClick={() => regenerateStep(2)}
                                    disabled={isLoading}
                                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
                                >
                                    <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                                    Regenerate Unselected
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: THE SHIFT */}
                    {state.step === 3 && (
                        <div className="animate-in slide-in-from-right-8 duration-300">
                            {renderHeader("THE SHIFT", "Shift from the 'Current You' to the 'Ideal You'.")}

                            {/* Column Headers */}
                            <div className="grid grid-cols-2 gap-4 mb-2 px-2">
                                <span className="text-[10px] uppercase tracking-widest text-red-600 font-bold">Current You</span>
                                <span className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold">Ideal You</span>
                            </div>

                            <div className="space-y-2">
                                {state.selectedBeliefs.map((belief, i) => (
                                    <div key={i} className="grid grid-cols-2 gap-4 p-3 border border-zinc-800/50 bg-zinc-900/30 rounded-lg">
                                        {/* Negative */}
                                        <div className="text-sm font-serif text-red-300/60 leading-tight flex items-center">
                                            "{belief.negative}"
                                        </div>
                                        {/* Positive */}
                                        <div className="text-sm font-serif text-emerald-100 font-medium leading-tight flex items-center">
                                            "{belief.positive}"
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP 4: THOUGHTS */}
                    {state.step === 4 && (
                        <div className="animate-in slide-in-from-right-8 duration-300">
                            {renderHeader("New Mindset", "Adopt these new mental models.")}
                            <div className="space-y-2">
                                {state.generatedThoughts.map((thought, i) => {
                                    const isSelected = state.selectedThoughts.includes(thought);
                                    return (
                                        <div
                                            key={i}
                                            onClick={() => toggleThought(thought)}
                                            className={cn(
                                                "p-3 border border-zinc-800 bg-zinc-900/50 cursor-pointer flex items-center gap-3 hover:border-zinc-700 transition-colors rounded-lg",
                                                isSelected && "border-emerald-900/50 bg-emerald-950/10"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 border flex items-center justify-center shrink-0 rounded-sm",
                                                isSelected ? "bg-emerald-600 border-emerald-600 text-white" : "border-zinc-700 bg-transparent"
                                            )}>
                                                {isSelected && <Check className="w-3 h-3" />}
                                            </div>
                                            <p className={cn("text-sm font-serif leading-snug", isSelected ? "text-emerald-100" : "text-zinc-300/90")}>
                                                "{thought}"
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex justify-center mt-4">
                                <button
                                    onClick={() => regenerateStep(4)}
                                    disabled={isLoading}
                                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
                                >
                                    <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                                    Regenerate Unselected
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 5: RULES */}
                    {state.step === 5 && (
                        <div className="animate-in slide-in-from-right-8 duration-300">
                            {renderHeader("New Rules", "Lock this mindset in with these operating instructions.")}
                            <div className="space-y-2">
                                {state.generatedRules.map((rule, i) => {
                                    const isSelected = state.selectedRules.some(r => r.title === rule.title);
                                    return (
                                        <div
                                            key={i}
                                            onClick={() => toggleRule(rule)}
                                            className={cn(
                                                "p-3 border border-zinc-800 bg-zinc-900/50 cursor-pointer flex items-center gap-3 hover:border-zinc-700 transition-colors rounded-lg",
                                                isSelected && "border-emerald-900/50 bg-emerald-950/10"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 border flex items-center justify-center shrink-0 rounded-sm self-start mt-1",
                                                isSelected ? "bg-emerald-600 border-emerald-600 text-white" : "border-zinc-700 bg-transparent"
                                            )}>
                                                {isSelected && <Check className="w-3 h-3" />}
                                            </div>
                                            <div>
                                                <p className={cn("text-sm font-bold", isSelected ? "text-white" : "text-zinc-300")}>
                                                    "{rule.title}"
                                                </p>
                                                <p className={cn("text-xs leading-relaxed mt-0.5", isSelected ? "text-emerald-100/70" : "text-zinc-500")}>
                                                    {rule.description}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex justify-center mt-4">
                                <button
                                    onClick={() => regenerateStep(5)}
                                    disabled={isLoading}
                                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
                                >
                                    <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                                    Regenerate Unselected
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 6: ACTIONS */}
                    {state.step === 6 && (
                        <div className="animate-in slide-in-from-right-8 duration-300">
                            {renderHeader("Immediate Actions", "What would the Ideal You do right now?")}
                            <div className="space-y-2">
                                {state.generatedActions.map((action, i) => {
                                    const isSelected = state.selectedActions.includes(action);
                                    return (
                                        <div
                                            key={i}
                                            onClick={() => toggleAction(action)}
                                            className={cn(
                                                "p-3 border border-zinc-800 bg-zinc-900/50 cursor-pointer flex items-center gap-3 hover:border-zinc-700 transition-colors rounded-lg",
                                                isSelected && "border-blue-900/50 bg-blue-950/10"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 border flex items-center justify-center shrink-0 rounded-sm",
                                                isSelected ? "bg-blue-600 border-blue-600 text-white" : "border-zinc-700 bg-transparent"
                                            )}>
                                                {isSelected && <Check className="w-3 h-3" />}
                                            </div>
                                            <p className={cn("text-sm font-serif", isSelected ? "text-blue-200" : "text-zinc-500")}>
                                                "{action}"
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex justify-center mt-4">
                                <button
                                    onClick={() => regenerateStep(6)}
                                    disabled={isLoading}
                                    className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
                                >
                                    <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                                    Regenerate Unselected
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ERROR MESSAGE */}
                    {error && (
                        <div className="mt-6 p-4 bg-red-950/50 border border-red-900 text-red-400 text-sm text-center">
                            {error}
                        </div>
                    )}
                </div>

                {/* BOTTOM ACTION BAR (FOOTER) */}
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-zinc-950 border-t border-zinc-900 flex items-center justify-between px-6 z-20">

                    {/* LEFT: BACK */}
                    <button
                        onClick={state.step === 1 ? onClose : prevStep}
                        className="text-zinc-500 hover:text-white uppercase text-xs font-bold tracking-widest transition-colors"
                    >
                        {state.step === 1 ? "CANCEL" : "BACK"}
                    </button>

                    {/* RIGHT: NEXT */}
                    <button
                        onClick={buttonAction}
                        disabled={isLoading || buttonDisabled}
                        className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-full text-xs font-black uppercase tracking-widest shadow-lg shadow-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {buttonText}
                    </button>
                </div>
            </div>
        </div>
    );
}
