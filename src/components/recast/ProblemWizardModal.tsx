import React, { useEffect } from 'react';
import { useProblemWizard, Belief, Rule } from '@/hooks/useProblemWizard';
import { Button } from '@/components/ui/Button';
import { X, Check, ArrowRight, RefreshCw, ChevronLeft, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/lib/auth/AuthContext';
import { createPost } from '@/lib/firebase/posts';
import { useRouter } from 'next/navigation';

interface ProblemWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ProblemWizardModal({ isOpen, onClose }: ProblemWizardModalProps) {
    const router = useRouter();
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
        updateRule,
        regenerateStep,
        nextStep,
        prevStep
    } = useProblemWizard();

    const { user } = useAuth();

    // --- EDIT STATE ---
    const [editingRuleIndex, setEditingRuleIndex] = React.useState<number | null>(null);
    const [editTitle, setEditTitle] = React.useState("");
    const [editDesc, setEditDesc] = React.useState("");

    const handleEditClick = (index: number, rule: Rule) => {
        setEditingRuleIndex(index);
        setEditTitle(rule.title);
        setEditDesc(rule.description);
    };

    const handleSaveRule = (index: number) => {
        updateRule(index, { title: editTitle, description: editDesc });
        setEditingRuleIndex(null);
    };

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
            // 2. Update Character Bible
            const bibleRef = doc(db, 'users', user.uid);

            // Merge core_beliefs (strings of positive beliefs) - user requested "New Beliefs"
            const newBeliefs = state.selectedBeliefs.map(b => b.positive);
            // Merge strategies (objects)
            const newRules = state.selectedRules.map(r => ({
                id: crypto.randomUUID(),
                rule: r.title,
                description: r.description,
                category: 'recast',
                active: true // default to active?
            }));

            // Assuming state.selectedActions exists and newActions is derived from it
            // If not, you'll need to define state.selectedActions in useProblemWizard
            const newActions = state.selectedActions.map(a => ({
                id: crypto.randomUUID(),
                action: a,
                category: 'recast',
                active: true
            }));

            await updateDoc(bibleRef, {
                "character_bible.core_beliefs": arrayUnion(...newBeliefs),
                "character_bible.rules": arrayUnion(...newRules),
                "character_bible.thoughts": arrayUnion(...state.selectedThoughts),
                "character_bible.suggested_actions": arrayUnion(...newActions),
                "character_bible.last_updated": Date.now()
            });

            // Create Feed Post
            await createPost(
                user.uid,
                state.rant,
                state.selectedBeliefs,
                state.selectedRules,
                state.selectedActions
            );

            // Refresh Data
            router.refresh();

            // Success UI
            const toast = document.createElement('div');
            toast.className = "fixed top-4 right-4 bg-emerald-600 text-white px-6 py-3 rounded-lg shadow-xl z-[100] animate-in slide-in-from-top-2 font-bold uppercase tracking-widest text-sm";
            toast.innerText = "CHARACTER UPDATED & POST CREATED";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);

            onClose();

        } catch (err) {
            console.error("Failed to save recast results:", err);
            alert("Failed to save. Please try again.");
        }
    };


    // --- RENDER STEPS ---

    const renderProgressBar = () => (
        <div className="w-full h-1 bg-zinc-900 mb-6 flex">
            {[1, 2, 3, 4, 5].map(s => (
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
                    text: "FINISH & POST",
                    action: handleFinish,
                    disabled: state.selectedRules.length === 0
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
                        STEP {state.step} / 5
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

                    {/* STEP 5: RULES / STRATEGY */}
                    {state.step === 5 && (
                        <div className="animate-in slide-in-from-right-8 duration-300">
                            {renderHeader("STRATEGY SELECTION", "Here are suggestions based on your Ideal Character. Edit them to fit your life, then select the ones you want to keep.")}
                            <div className="space-y-2">
                                {state.generatedRules.map((rule, i) => {
                                    const isSelected = state.selectedRules.some(r => r.title === rule.title);
                                    const isEditing = editingRuleIndex === i;

                                    if (isEditing) {
                                        return (
                                            <div key={i} className="p-3 border border-zinc-700 bg-zinc-900 rounded-lg flex flex-col gap-2">
                                                <input
                                                    className="bg-transparent border-b border-zinc-700 text-white font-bold text-sm focus:outline-none focus:border-red-500 pb-1"
                                                    value={editTitle}
                                                    onChange={(e) => setEditTitle(e.target.value)}
                                                    placeholder="Strategy Title"
                                                    autoFocus
                                                />
                                                <textarea
                                                    className="bg-transparent border-b border-zinc-700 text-zinc-400 text-xs focus:outline-none focus:border-red-500 resize-none pb-1"
                                                    value={editDesc}
                                                    onChange={(e) => setEditDesc(e.target.value)}
                                                    placeholder="Implementation details..."
                                                    rows={2}
                                                />
                                                <div className="flex justify-end gap-2 mt-1">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setEditingRuleIndex(null); }}
                                                        className="text-[10px] text-zinc-500 font-bold uppercase hover:text-white"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleSaveRule(i); }}
                                                        className="text-[10px] text-red-500 font-bold uppercase hover:text-red-400"
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div
                                            key={i}
                                            onClick={() => toggleRule(rule)}
                                            className={cn(
                                                "group relative p-3 border border-zinc-800 bg-zinc-900/50 cursor-pointer flex items-center gap-3 hover:border-zinc-700 transition-colors rounded-lg",
                                                isSelected && "border-emerald-900/50 bg-emerald-950/10"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 border flex items-center justify-center shrink-0 rounded-sm self-start mt-1",
                                                isSelected ? "bg-emerald-600 border-emerald-600 text-white" : "border-zinc-700 bg-transparent"
                                            )}>
                                                {isSelected && <Check className="w-3 h-3" />}
                                            </div>
                                            <div className="flex-1 pr-6">
                                                <p className={cn("text-sm font-bold", isSelected ? "text-white" : "text-zinc-300")}>
                                                    "{rule.title.replace(/^["']|["']$/g, '')}"
                                                </p>
                                                <p className={cn("text-xs leading-relaxed mt-0.5", isSelected ? "text-emerald-100/70" : "text-zinc-500")}>
                                                    {rule.description}
                                                </p>
                                            </div>

                                            {/* Edit Button */}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleEditClick(i, rule); }}
                                                className="absolute right-3 top-3 text-zinc-600 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <Pencil className="w-3 h-3" />
                                            </button>
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
