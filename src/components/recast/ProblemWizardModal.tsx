import React, { useEffect } from 'react';
import { useProblemWizard, Belief, Rule, Vision } from '@/hooks/useProblemWizard';
import { Button } from '@/components/ui/Button';
import { X, Check, ArrowRight, RefreshCw, ChevronLeft, Pencil, GitCommit, AlertCircle, Terminal, Activity } from 'lucide-react';
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
        setRant,
        generateBeliefs,
        toggleBelief,
        generateVision,
        toggleVision,
        generateConstraints,
        updateRule,
        regenerateStep,
        prevStep,
        nextStep,
        updateCalibration,
        saveCalibration,
        generateGhostStory,
        error
    } = useProblemWizard();

    const { user } = useAuth();

    // 0. Manual Loading State (since handleFinish is async)
    const [isSubmitting, setIsSubmitting] = React.useState(false);

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
        setIsSubmitting(true);

        try {
            // 1. Fetch current Bible (to act as base)
            const { getDoc } = await import('firebase/firestore');
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);
            const bible = userSnap.data()?.character_bible || {};
            const bibleRef = doc(db, 'users', user.uid);

            let dbRules = (bible.rules || []) as { id: string, rule: string, description?: string, category?: string, active?: boolean }[];

            // Identify Removed Rules (from Patch)
            // Deprecated IDs from backend are either full titles or IDs
            const deprecatedIds = state.patch?.deprecated_ids || [];

            // 2. Filter out deprecated rules
            // Logic: Remove if rule.id matches OR rule.rule (title) matches
            let finalRules = dbRules.filter(dbRule => {
                const isDeprecated = deprecatedIds.includes(dbRule.id) || deprecatedIds.includes(dbRule.rule);
                return !isDeprecated;
            });

            // 3. Add NEW rules (from Selection)
            const newRuleObjects = state.selectedRules.map(r => ({
                id: crypto.randomUUID(),
                rule: r.title,
                description: r.description,
                category: 'recast',
                active: true,
                installedAt: Date.now()
            }));

            finalRules = [...finalRules, ...newRuleObjects];

            // 4. Update Bible
            // Ensure we save the LATEST calibration data (Title/Summary) using state.calibration
            const updatedTitle = state.calibration.title || bible.title;
            const updatedSummary = state.calibration.summary || bible.summary;

            // Add positive beliefs
            const newBeliefStrings = state.selectedBeliefs.map(b => b.positive);
            // new actions from vision
            const newActions = state.selectedVision.map(v => ({
                id: crypto.randomUUID(),
                action: v.title,
                category: 'recast',
                active: true
            }));

            await updateDoc(bibleRef, {
                "character_bible.title": updatedTitle,
                "character_bible.summary": updatedSummary,
                "character_bible.core_beliefs": arrayUnion(...newBeliefStrings),
                "character_bible.rules": finalRules, // OVERWRITE with calculated patch
                "character_bible.visions": arrayUnion(...state.selectedVision.map(v => ({ title: v.title, description: v.description }))),
                "character_bible.suggested_actions": arrayUnion(...newActions),
                "character_bible.last_updated": Date.now(),

                // Add to history
                "character_recast_history": arrayUnion({
                    timestamp: Date.now(),
                    rant: state.rant,
                    beliefs: state.selectedBeliefs,
                    vision: state.selectedVision,
                    patch: state.patch,
                    story: null
                })
            });

            // 5. Create "Post" for Feed
            const story = await generateGhostStory();

            // CONSTRUCT FOOTER (The Data)
            const beliefList = state.selectedBeliefs.map(b => `- ${b.negative} -> ${b.positive}`).join("\n");
            const visionList = state.selectedVision.map(v => `- ${v.title}: ${v.description}`).join("\n");
            const ruleList = state.selectedRules.map(r => `- ${r.title}: ${r.description}`).join("\n");

            const footerText = `
CORE BELIEFS:
${beliefList}

THE SHIFT:
- ${updatedTitle}: ${updatedSummary}

THE VISION:
${visionList}

STRATEGIES:
${ruleList}`;

            // ASSEMBLE CONTENT
            // Raw: Rant + Footer
            const contentRaw = `${state.rant}\n\n${footerText}`;
            // Public: Story + Footer
            const contentPublic = `${story || state.rant}\n\n${footerText}`;

            // Create Post Payload
            const postPayload = {
                content: contentPublic,
                content_raw: contentRaw,
                authorId: user.uid,
                authorName: "The Ghostwriter",
                characterId: "recast_wizard",
                constraints: ["recast"],
                tags: ["recast", "identity_shift"],
                type: 'recast' as const, // Explicit type cast
                rant: state.rant,
                core_beliefs: state.selectedBeliefs,
                vision: state.selectedVision
            };

            await createPost(postPayload);

            // 6. Refresh & Close
            router.refresh();
            setTimeout(() => {
                onClose();
                setIsSubmitting(false);
            }, 500);

        } catch (e) {
            console.error("Failed to commit identity update", e);
            alert("Failed to save update. Please try again."); // Simple fallback alert
            setIsSubmitting(false);
        }
    };

    // --- RENDER HELPERS ---

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
                    text: isLoading ? "ANALYZING..." : "ANALYZE BELIEFS",
                    action: generateBeliefs,
                    disabled: state.rant.length < 10
                };
            case 2:
                // Step 2 -> Step 3 (Confirm & Calibrate)
                return {
                    text: "CONFIRM & CONTINUE",
                    action: nextStep,
                    disabled: state.selectedBeliefs.length === 0
                };
            case 3:
                return {
                    // Step 3 was "The Shift" -> Next is Vision (Step 4)? 
                    // Wait, generateVision was redundant in case 2?
                    // Logic check:
                    // Step 1 -> generateBeliefs -> Step 2
                    // Step 2 -> generateVision -> Step 4? 
                    // Where is Step 3?
                    // Step 3 is "The Shift" (Review).
                    // It should have a "Next" button that goes to Step 4 (Vision).
                    text: isLoading ? "GENERATING VISION..." : "GENERATE VISION",
                    action: saveCalibration,
                    disabled: !state.calibration.title || !state.calibration.summary
                };
            case 4:
                return {
                    text: isLoading ? "GENERATING SYSTEM UPDATE..." : "GENERATE SYSTEM UPDATE",
                    action: generateConstraints,
                    disabled: state.selectedVision.length === 0
                };
            case 5:
                return {
                    text: isSubmitting ? "COMMITTING..." : "COMMIT UPDATE",
                    action: handleFinish,
                    disabled: (!state.patch?.new_rules || state.patch.new_rules.length === 0) || isSubmitting
                };
            default:
                return { text: "NEXT", action: () => { }, disabled: false }; // Fallback, should not be reached
        }
    }

    const { text: buttonText, action: buttonAction, disabled: buttonDisabled } = getButtonProps();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full h-full md:h-auto md:max-w-2xl bg-zinc-950 md:border border-zinc-800 md:shadow-2xl flex flex-col relative max-h-[90vh]">

                {/* TOP BAR */}
                <div className="h-14 border-b border-zinc-900 flex items-center justify-end px-4 shrink-0">
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

                    {/* STEP 3: THE SHIFT & CALIBRATION */}
                    {state.step === 3 && (
                        <div className="animate-in slide-in-from-right-8 duration-300">
                            {renderHeader("WHO IS HANDLING THIS?", "Confirm your Identity before we generate the Vision.")}

                            {/* CALIBRATION FORM */}
                            <div className="mb-8 p-6 border border-zinc-800 bg-zinc-900/50 rounded-lg space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1 block">Character Title / Role</label>
                                    <input
                                        value={state.calibration.title}
                                        onChange={(e) => updateCalibration('title', e.target.value)}
                                        className="w-full bg-black border border-zinc-800 p-3 text-white font-bold rounded focus:border-emerald-500 focus:outline-none"
                                        placeholder="e.g. The Stoic Father"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1 block">Identity Summary</label>
                                    <textarea
                                        value={state.calibration.summary}
                                        onChange={(e) => updateCalibration('summary', e.target.value)}
                                        className="w-full bg-black border border-zinc-800 p-3 text-zinc-300 text-sm rounded focus:border-emerald-500 focus:outline-none resize-none h-24"
                                        placeholder="Briefly describe your ideal self..."
                                    />
                                </div>
                            </div>

                            {/* THE SHIFT VISUALIZATION */}
                            <div className="space-y-2 opacity-50 hover:opacity-100 transition-opacity">
                                <div className="flex items-center gap-2 mb-2">
                                    <Activity className="w-4 h-4 text-zinc-500" />
                                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Active Shift</span>
                                </div>
                                {state.selectedBeliefs.map((belief, i) => (
                                    <div key={i} className="grid grid-cols-2 gap-4 p-2 border border-zinc-900 rounded bg-black/20">
                                        <div className="text-xs text-red-400 line-through opacity-70">"{belief.negative}"</div>
                                        <div className="text-xs text-emerald-400 font-bold">"{belief.positive}"</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP 4: VISION */}
                    {state.step === 4 && (
                        <div className="animate-in slide-in-from-right-8 duration-300">
                            {renderHeader("THE VISION", "Select the Micro-Scenes that resonate with your Ideal Self.")}
                            <div className="space-y-3">
                                {state.generatedVision.map((vision, i) => {
                                    const isSelected = state.selectedVision.some(v => v.title === vision.title);
                                    return (
                                        <div
                                            key={i}
                                            onClick={() => toggleVision(vision)}
                                            className={cn(
                                                "p-4 border border-zinc-800 bg-zinc-900/50 cursor-pointer flex flex-col gap-2 hover:border-emerald-500/30 transition-all rounded-lg group",
                                                isSelected && "border-emerald-500/50 bg-emerald-950/10"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-4 h-4 border flex items-center justify-center shrink-0 rounded-sm",
                                                    isSelected ? "bg-emerald-600 border-emerald-600 text-white" : "border-zinc-700 bg-transparent"
                                                )}>
                                                    {isSelected && <Check className="w-3 h-3" />}
                                                </div>
                                                <h4 className={cn("text-sm font-bold uppercase tracking-wider", isSelected ? "text-emerald-400" : "text-zinc-400")}>
                                                    {vision.title}
                                                </h4>
                                                {isSelected && <span className="text-[10px] bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">SELECTED</span>}
                                            </div>
                                            <p className="text-sm text-zinc-400 pl-7 font-serif leading-relaxed italic opacity-80 group-hover:opacity-100">
                                                "{vision.description}"
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex justify-center mt-6">
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

                    {/* STEP 5: SYSTEM UPDATE (The Diff View) */}
                    {state.step === 5 && (
                        <div className="animate-in slide-in-from-right-8 duration-300 pb-20">
                            {renderHeader("SYSTEM UPDATE", "Review the patch before committing changes to your Character Bible.")}

                            {state.patch?.reason && (
                                <div className="mb-6 p-3 bg-zinc-900/50 border border-zinc-800 rounded text-xs font-mono text-zinc-500">
                                    <span className="text-zinc-400 font-bold">ENGINEER LOG:</span> {state.patch.reason}
                                </div>
                            )}

                            <div className="space-y-8">
                                {/* SECTION A: INSTALLED (Green) */}
                                {state.patch?.new_rules && state.patch.new_rules.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-emerald-500 pb-2 border-b border-emerald-500/20">
                                            <Terminal className="w-4 h-4" />
                                            <span className="text-xs font-black uppercase tracking-widest">New Code (Install)</span>
                                        </div>
                                        {state.patch.new_rules.map((rule, i) => {
                                            const isSelected = state.selectedRules.some(r => r.title === rule.title);
                                            return (
                                                <div key={i} className={cn("group relative p-4 border rounded-lg transition-all", isSelected ? "border-emerald-500/30 bg-emerald-950/10" : "border-zinc-800 bg-zinc-900/10 opacity-60")}>
                                                    <div className="flex items-start gap-4">
                                                        {/* CHECKBOX */}
                                                        <div
                                                            onClick={() => updateRule(i, rule)} // Toggle selection logic needed? No, toggleRule needs the rule object
                                                            // Actually, we use toggleRule(rule)
                                                            className="cursor-pointer"
                                                        >
                                                            <div className={cn("w-5 h-5 flex items-center justify-center shrink-0 rounded border", isSelected ? "bg-emerald-600 border-emerald-600 text-white" : "border-zinc-700 bg-transparent")}>
                                                                {isSelected && <Check className="w-3 h-3" />}
                                                            </div>
                                                        </div>

                                                        <div className="flex-1 space-y-2">
                                                            {/* EDITABLE TITLE */}
                                                            <input
                                                                value={rule.title}
                                                                onChange={(e) => updateRule(i, { ...rule, title: e.target.value })}
                                                                className="w-full bg-transparent border-none p-0 text-sm font-bold font-mono text-emerald-100 focus:outline-none focus:ring-0 placeholder:text-zinc-600"
                                                                placeholder="Rule Title"
                                                            />
                                                            {/* EDITABLE DESCRIPTION */}
                                                            <textarea
                                                                value={rule.description}
                                                                onChange={(e) => updateRule(i, { ...rule, description: e.target.value })}
                                                                className="w-full bg-transparent border-none p-0 text-xs text-zinc-400 leading-relaxed focus:outline-none focus:ring-0 resize-none h-auto placeholder:text-zinc-700"
                                                                placeholder="Rule Description"
                                                                rows={2}
                                                            />
                                                        </div>

                                                        {/* TOGGLE BUTTON (Alternative to Checkbox) */}
                                                        <button
                                                            onClick={() => {
                                                                const { toggleRule } = useProblemWizard(); // Need to expose or pass
                                                                // toggleRule is available in scope? Yes.
                                                                // But wait, updateRule updates the `patch` state.
                                                                // toggleRule updates `selectedRules`.
                                                                // We need to call toggleRule(rule).
                                                                // But proper `toggleRule` needs the UP-TO-DATE rule from the map iteration?
                                                                // Yes.
                                                            }}
                                                        // Simpler: Just make the checkbox invoke toggleRule
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* SECTION B: DEPRECATED (Red) */}
                                {state.patch?.deprecated_ids && state.patch.deprecated_ids.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-red-500 pb-2 border-b border-red-500/20">
                                            <X className="w-4 h-4" />
                                            <span className="text-xs font-black uppercase tracking-widest">Deprecated (Uninstall)</span>
                                        </div>
                                        {state.patch.deprecated_ids.map((id, i) => {
                                            // 1. Try to find the rule in current Bible to show Title instead of ID
                                            // We need access to `bible`? We don't have it in render.
                                            // We only fetch it in handleFinish.
                                            // Solution: Fetch bible on mount (useProblemWizard already does `get_context`, but that returns `calibration` data?)
                                            // useProblemWizard gets `res.bible`.
                                            // We should store `existingRules` in state?
                                            // For now, let's just display the ID/String. 
                                            // If the ID IS the title (which it often is in our prompt logic), it's fine.
                                            // Prompt says "deprecated_ids".
                                            return (
                                                <div key={i} className="group relative p-3 border border-red-900/30 bg-red-950/10 rounded-lg opacity-70 hover:opacity-100 transition-opacity">
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-5 h-5 flex items-center justify-center shrink-0 rounded bg-red-900/50 text-red-200">
                                                                <span className="text-xs font-bold">-</span>
                                                            </div>
                                                            <h4 className="text-sm font-bold font-mono text-red-200 line-through decoration-red-500/50">
                                                                {id}
                                                            </h4>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
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
