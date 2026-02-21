import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRecastWizard } from '@/hooks/useRecastWizard';
import { RecastMode } from '@/types/recast';
import { X, ArrowRight, RefreshCw, Check, Zap, Terminal, Globe, Calendar, User, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/lib/auth/AuthContext';
import { createPost } from '@/lib/firebase/posts';
import { useRouter } from 'next/navigation';
import { Driver, Rule, Vision } from '@/types/recast';
import { RecastThinkingState } from './RecastThinkingState';

interface RecastWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode?: RecastMode;
}

// --- RECAST SHELL COMPONENT ---
const RecastShell = ({
    children,
    mode,
    step,
    onClose
}: {
    children: React.ReactNode;
    mode: RecastMode;
    step: number;
    onClose: () => void;
}) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full h-full md:h-auto md:max-w-2xl bg-black md:border border-zinc-800 md:shadow-2xl flex flex-col relative max-h-[90vh] rounded-3xl overflow-hidden">
                {/* Header - CONSTANT */}
                <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 shrink-0 bg-zinc-900/50">
                    <h2 className="text-sm font-bold text-zinc-200">
                        {mode === 'PROBLEM' ? 'New Recast' : 'New Design'}
                    </h2>
                    <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5, 6].map((s) => (
                            <div key={s} className={`h-1 rounded-full transition-all duration-300 ${s <= step ? (mode === 'PROBLEM' ? 'bg-white w-4' : 'bg-blue-500 w-4') : 'bg-zinc-800 w-2'}`} />
                        ))}
                    </div>
                </div>

                {/* Close Button Absolute */}
                <button onClick={onClose} className="absolute top-5 right-6 text-zinc-500 hover:text-white transition-colors z-10 bg-zinc-800/50 rounded-full p-1">
                    <X className="w-4 h-4" />
                </button>

                {/* Dynamic Content - MUST INHERIT DARK THEME */}
                <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default function RecastWizardModal({ isOpen, onClose, mode = 'PROBLEM' }: RecastWizardModalProps) {
    const router = useRouter();
    const { user } = useAuth();

    // Derived Labels based on Mode
    const LABELS = {
        PROBLEM: {
            title: "New Recast",
            step1Title: "What's the tension?",
            step1Subtitle: "Vent freely. No judgment.",
            step1Placeholder: "I feel stuck because...",
            inputQuery: "What's the tension?", // Keep for legacy if needed
            inputPlaceholder: "I feel stuck because...",
            inputHint: "What happened?",
            step2Title: "Diagnosis",
            step2Subtitle: "Identifying Core Negative Beliefs",
            step3Title: "Who I Want To Be",
            step3Subtitle: "I desire to be this type of person.",
            driverLabel: "Shadow Belief",
            step5Title: "How does this serve me?",
            step5Subtitle: "Regardless of what is happening, every situation has the potential to support you. Which of these options resonates most with you? Select 1-3.",
            visionTitle: "A Fresh Perspective",
            visionSubtitle: "Which of the three statements feels most like you? Select 1-3",
            constraintsTitle: "System Update",
            constraintsSubtitle: "Installing Corrective Rules"
        },
        DESIRE: {
            title: "Reality Architect",
            step1Title: "What is the Target?",
            step1Subtitle: "Describe the magic.",
            step1Placeholder: "I want to experience...",
            inputQuery: "What is the Target?",
            inputPlaceholder: "I want to experience...",
            inputHint: "Describe the state you want to live in.",
            step2Title: "How would you feel?",
            step2Subtitle: "Identifying Target Emotions",
            step3Title: "Who I Want To Be",
            step3Subtitle: "I desire to be this type of person.",
            driverLabel: "Core Driver",
            visionTitle: "Future Memory",
            visionSubtitle: "Lenses of the Target Reality",
            constraintsTitle: "Maintenance Protocol",
            constraintsSubtitle: "Installing Sustainability Rules"
        }
    }[mode];

    // Theme Colors
    const THEME = {
        PROBLEM: {
            accent: 'text-white',
            border: 'border-zinc-700',
            bgSelected: 'bg-zinc-800',
            textSelected: 'text-white',
            button: 'bg-white hover:bg-zinc-200 text-black',
            ring: 'focus:ring-white'
        },
        DESIRE: {
            accent: 'text-blue-400',
            border: 'border-blue-900/50',
            bgSelected: 'bg-blue-950/20',
            textSelected: 'text-blue-400',
            button: 'bg-blue-600 hover:bg-blue-500 text-white',
            ring: 'focus:ring-blue-900'
        }
    }[mode];

    const {
        state,
        isLoading,
        error,
        setInputText,
        generateDiagnosis,
        toggleDriver,
        generateVision, // Was toggleVision
        toggleVision,
        generateConstraints,
        toggleRule,
        updateRule,
        toggleUpdate, // NEW
        nextStep,
        prevStep,
        regenerateStep,
        updateCalibration,
        saveCalibration,
        generateGhostStory
    } = useRecastWizard(mode);

    const [isSubmitting, setIsSubmitting] = useState(false);

    // Prevent scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
        return () => { document.body.style.overflow = 'auto'; };
    }, [isOpen]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);


    // --- FINISH HANDLER ---
    const handleFinish = async () => {
        if (!user) return;
        setIsSubmitting(true);

        try {
            // 1. Fetch current Bible
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);
            const bible = userSnap.data()?.character_bible || {};
            const bibleRef = doc(db, 'users', user.uid);

            const compiledBible = bible.compiled_bible || {};
            let dbRules = (compiledBible.behavioral_responses || []) as { id: string, rule: string, description?: string, category?: string, active?: boolean }[];

            // 2. Identify Removed Rules (Filtered by Acceptance)
            const deprecatedIds = state.patch?.deprecated_ids || [];

            // Logic: Only remove a rule IF its replacement (update) was ACCEPTED.
            // If the user rejected the update, we KEEP the old rule.
            const acceptedUpdates = state.selectedUpdates || [];
            const rejectedUpdates = (state.patch?.updated_rules || []).filter(u => !acceptedUpdates.some(au => au.id === u.id));

            // We need to know which deprecated ID corresponds to which update.
            // Current API doesn't strictly map them 1:1 in the response structure (it returns a list of deprecated IDs).
            // ASSUMPTION: The 'updated_rules' id matches the OLD rule id being replaced.
            // If the API returns a *new* ID for the updated rule, we might need to rely on the 'deprecated_ids' being accurate.

            // Simplified Logic: 
            // If an ID is in 'deprecated_ids', it should be removed UNLESS it corresponds to a rejected update.
            // For now, let's assume 'updated_rules.id' IS the ID of the rule being replaced/updated.

            const idsKeep = rejectedUpdates.map(u => u.id);

            let finalRules = dbRules.filter(dbRule => {
                // If it's in the keep list, keep it (even if deprecated)
                if (idsKeep.includes(dbRule.id)) return true;

                // Otherwise, check if deprecated
                const isDeprecated = deprecatedIds.includes(dbRule.id);
                return !isDeprecated;
            });

            // 3. Add NEW rules
            const newRuleObjects = state.selectedRules.map(r => ({
                id: crypto.randomUUID(),
                rule: r.title,
                description: r.description,
                category: 'recast',
                active: true,
                installedAt: Date.now()
            }));

            // 4. Add UPDATED rules (Accepted Ones)
            const updatedRuleObjects = acceptedUpdates.map(r => ({
                id: crypto.randomUUID(), // Valid new ID
                rule: r.title,
                description: r.description,
                category: 'recast',
                active: true,
                installedAt: Date.now()
            }));

            finalRules = [...finalRules, ...newRuleObjects, ...updatedRuleObjects];

            // 4. Update Bible
            const currentSourceCode = bible.source_code || {};
            const updatedTitle = state.calibration.title || currentSourceCode.archetype;
            const updatedSummary = state.calibration.summary || currentSourceCode.manifesto;
            // Assuming for now that new drivers become the new core beliefs.
            // If we want to append them, we'd need string manipulation or to change core_beliefs back to an array.
            // Let's just create a comma separated string for now.
            const newDriverStrings = state.selectedDrivers.map(d => d.id).join(", ");
            const updatedCoreBeliefs = currentSourceCode.core_beliefs ? `${currentSourceCode.core_beliefs}, ${newDriverStrings}` : newDriverStrings;

            const newActions = state.selectedVision.map(v => ({
                id: crypto.randomUUID(),
                action: v.title,
                category: 'recast',
                active: true
            }));

            // Merge existing visions with the new visions
            const existingVisions = compiledBible.vision || [];
            const updatedVisions = [...existingVisions, ...state.selectedVision.map(v => ({ title: v.title, description: v.description }))];

            await updateDoc(bibleRef, {
                "character_bible.source_code.archetype": updatedTitle,
                "character_bible.source_code.manifesto": updatedSummary,
                "character_bible.source_code.core_beliefs": updatedCoreBeliefs,
                "character_bible.compiled_bible.behavioral_responses": finalRules,
                "character_bible.compiled_bible.vision": updatedVisions,
                // Using root for suggested_actions for now since schema didn't explicitly move it, but
                // it should probably be in compiled_bible. We'll leave it at root for safety or move it to compiled_bible.
                "character_bible.suggested_actions": arrayUnion(...newActions),
                "character_bible.last_updated": Date.now(),
                "character_recast_history": arrayUnion({
                    timestamp: Date.now(),
                    mode: mode,
                    input: state.input_text,
                    drivers: state.selectedDrivers,
                    vision: state.selectedVision,
                    patch: state.patch,
                })
            });

            // 5. Create Post
            // REFACTOR: Construct Footer FIRST to pass to Ghostwriter
            const driverList = state.selectedDrivers.map(d => d.type === 'BELIEF' ? `- ${d.negative} -> ${d.positive}` : `- ${d.id}`).join("\n");
            const visionList = state.selectedVision.map(v => `- ${v.title}: ${v.description}`).join("\n");
            const ruleList = state.selectedRules.map(r => `- ${r.title}: ${r.description}`).join("\n");

            const footerText = `
DRIVER / BELIEFS:
${driverList}

THE SHIFT:
- ${updatedTitle}: ${updatedSummary}

THE VISION:
${visionList}

PROTOCOL:
${ruleList}`;

            // Full Raw Context for Ghostwriter
            const contentRaw = `${state.input_text}\n\n${footerText}`;

            // Generate Story using FULL context
            const story = await generateGhostStory(contentRaw);

            // If story fails, use contentRaw (fallback)
            const contentPublic = story ? story : contentRaw;

            await createPost({
                content: contentPublic,
                content_raw: contentRaw,
                authorId: user.uid,
                authorName: "The Ghostwriter",
                characterId: "recast_wizard",
                constraints: ["recast"],
                tags: ["recast", mode.toLowerCase()],
                type: 'recast',
                rant: state.input_text,
                core_beliefs: state.selectedDrivers,
                vision: state.selectedVision
            });

            router.refresh();
            setTimeout(() => {
                onClose();
                setIsSubmitting(false);
            }, 500);

        } catch (e) {
            console.error("Failed to commit identity update", e);
            alert("Failed to save update. Please try again.");
            setIsSubmitting(false);
        }
    };

    // --- RENDERERS ---

    // STEP 1: INPUT
    const renderInputStep = () => {
        const charCount = state.input_text.length;
        const minChars = 20;
        const isReady = charCount >= minChars;

        return (
            <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
                <div className="mb-6 space-y-1">
                    <h2 className="text-xl font-bold tracking-tight text-white">{LABELS.step1Title}</h2>
                    <p className="text-sm font-medium text-zinc-500">{LABELS.step1Subtitle}</p>
                </div>

                <div className="flex-1 flex flex-col gap-4">
                    <div className="relative flex-1">
                        <textarea
                            value={state.input_text}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder={LABELS.step1Placeholder}
                            className="w-full h-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 text-lg text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 resize-none font-medium leading-relaxed"
                            spellCheck={false}
                        />
                        <div className={cn(
                            "absolute bottom-4 right-4 text-xs font-mono font-medium px-2 py-1 rounded bg-black/50 backdrop-blur-sm transition-colors",
                            isReady ? "text-emerald-500" : "text-zinc-500"
                        )}>
                            {charCount} / {minChars}
                        </div>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-zinc-800">
                        <button onClick={onClose} className="text-zinc-500 hover:text-white text-sm font-medium px-4 py-2">
                            Cancel
                        </button>
                        <button
                            onClick={generateDiagnosis}
                            disabled={isLoading || !isReady}
                            className={cn(
                                "px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2",
                                isLoading || !isReady
                                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                    : "bg-white text-black hover:bg-zinc-200"
                            )}
                        >
                            {isLoading ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    <span>Analyzing...</span>
                                </>
                            ) : (
                                <>
                                    <span>Continue</span>
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // STEP 2: DIAGNOSIS (Problem) or EMOTIONS (Desire)
    const renderDiagnosisStep = () => (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-6 space-y-1">
                <h2 className="text-xl font-bold tracking-tight text-white">{LABELS.step2Title}</h2>
                <p className="text-sm font-medium text-zinc-500">Select {mode === 'PROBLEM' ? "the core issue" : "the target feeling"}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-1 space-y-2">
                {state.generatedDrivers.map((driver, i) => {
                    const isSelected = state.selectedDrivers.some(d => d.id === driver.id);
                    return (
                        <motion.button
                            key={driver.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
                            onClick={() => toggleDriver(driver)}
                            className={cn(
                                "w-full text-left p-4 rounded-xl border transition-all duration-200 flex items-center justify-between group h-14", // reduced height slightly
                                isSelected
                                    ? "bg-white border-white"
                                    : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700"
                            )}
                        >
                            <span className={cn("font-medium text-base truncate pl-2", isSelected ? "text-black" : "text-zinc-200")}>
                                {driver.negative || driver.id}
                            </span>

                            {/* Selection Indicator (Right) */}
                            <div className={cn(
                                "w-5 h-5 rounded-full flex items-center justify-center transition-all",
                                isSelected ? "bg-black" : "border border-zinc-700"
                            )}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                        </motion.button>
                    );
                })}
            </div>

            <div className="flex justify-between items-center mt-6 pt-4 border-t border-zinc-800">
                <button onClick={prevStep} className="text-zinc-500 hover:text-white text-sm font-medium px-4 py-2">Back</button>
                <button
                    onClick={nextStep}
                    disabled={state.selectedDrivers.length === 0}
                    className={cn(
                        "px-6 py-2.5 rounded-full text-sm font-bold transition-colors flex items-center gap-2",
                        state.selectedDrivers.length > 0
                            ? THEME.button
                            : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    )}
                >
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );

    // STEP 3: REVERSAL (NEW)
    const renderReversalStep = () => (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-6 space-y-1">
                <h2 className="text-xl font-bold tracking-tight text-white">{LABELS.step3Title}</h2>
                <p className="text-sm font-medium text-zinc-500">{LABELS.step3Subtitle}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-1 space-y-2 flex flex-col">
                {state.selectedDrivers.map((driver, i) => (
                    <motion.div
                        key={driver.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
                        className="w-full text-left p-4 rounded-xl border bg-zinc-900 border-zinc-800 flex items-center justify-between h-14 cursor-default" // reduced height
                    >
                        <span className="text-base font-medium text-zinc-200 truncate pl-2">
                            {driver.positive || "I am claiming this power."}
                        </span>

                        {/* Selection Indicator (Right) - Blue for Step 3 */}
                        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="flex justify-between items-center mt-6 pt-4 border-t border-zinc-800">
                <button onClick={prevStep} className="text-zinc-500 hover:text-white text-sm font-medium px-4 py-2">Back</button>
                <button
                    onClick={nextStep}
                    className="px-6 py-2.5 rounded-full bg-white hover:bg-zinc-200 text-black text-sm font-bold transition-colors flex items-center gap-2"
                >
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );

    // STEP 4: CALIBRATION (Was 3)
    const renderCalibrationStep = () => (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-white">Identity Lock</h2>
                <p className="text-zinc-500 text-sm">Confirm your Avatar before generation.</p>
            </div>

            <div className="mb-8 p-8 border border-zinc-800 bg-zinc-900/30 rounded-3xl space-y-6">
                <div>
                    <label className="text-xs font-bold text-zinc-500 mb-2 block uppercase tracking-wider">Archetype Title</label>
                    <input
                        value={state.calibration.title}
                        onChange={(e) => updateCalibration('title', e.target.value)}
                        className="w-full bg-transparent border-b border-zinc-800 pb-2 text-white text-lg focus:border-zinc-500 focus:outline-none placeholder-zinc-800 font-bold"
                        placeholder="e.g. The Architect"
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-zinc-500 mb-2 block uppercase tracking-wider">Manifesto</label>
                    <textarea
                        value={state.calibration.summary}
                        onChange={(e) => updateCalibration('summary', e.target.value)}
                        className="w-full bg-transparent border border-zinc-800 p-4 text-zinc-300 text-sm leading-relaxed focus:border-zinc-500 focus:outline-none resize-none h-32 placeholder-zinc-800 rounded-xl"
                        placeholder="Briefly describe your ideal state..."
                    />
                </div>
            </div>

            <div className="flex justify-between items-center mt-8 pt-6 border-t border-zinc-800">
                <button onClick={prevStep} className="text-zinc-500 hover:text-white text-sm font-bold">Back</button>
                <button
                    onClick={generateVision}
                    disabled={!state.calibration.title || !state.calibration.summary || isLoading}
                    className={cn("px-6 py-3 rounded-full text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2", THEME.button)}
                >
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    <span>{isLoading ? 'Generating...' : 'Next'}</span>
                </button>
            </div>
        </div>
    );

    // STEP 5: VISION (Was 6)
    const renderVisionStep = () => (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-white">{LABELS.visionTitle}</h2>
                <p className="text-zinc-500 text-sm">{LABELS.visionSubtitle}</p>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {state.generatedVision.map((vision, i) => {
                    const isSelected = state.selectedVision.some(v => v.title === vision.title);
                    return (
                        <div
                            key={i}
                            onClick={() => toggleVision(vision)}
                            className={cn(
                                "p-6 border cursor-pointer flex flex-col gap-3 transition-all duration-300 group hover:bg-zinc-900/50 rounded-2xl",
                                isSelected
                                    ? `${THEME.bgSelected} ${THEME.border}`
                                    : "border-zinc-800 bg-transparent"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-5 h-5 border rounded-full flex items-center justify-center shrink-0",
                                    isSelected ? `${THEME.textSelected} border-current` : "border-zinc-700 text-transparent"
                                )}>
                                    {isSelected && <Check className="w-3 h-3" />}
                                </div>
                                <h4 className={cn("text-sm font-bold uppercase tracking-wide", isSelected ? THEME.textSelected : "text-zinc-400")}>
                                    {vision.title}
                                </h4>
                            </div>
                            <p className="text-zinc-300 pl-8 leading-relaxed opacity-80 group-hover:opacity-100 text-base">
                                {vision.description.replace(/^["']|["']$/g, '')}
                            </p>
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-between items-center mt-8 pt-6 border-t border-zinc-800">
                <button onClick={prevStep} className="text-zinc-500 hover:text-white text-sm font-bold">Back</button>
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => regenerateStep(6)} // Updated to 6
                        disabled={isLoading}
                        className="text-xs font-bold text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                        Regenerate
                    </button>
                    <button
                        onClick={generateConstraints}
                        disabled={state.selectedVision.length === 0 || isLoading}
                        className={cn("px-6 py-3 rounded-full text-sm font-bold transition-colors disabled:opacity-50", THEME.button)}
                    >
                        {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                        <span>{isLoading ? 'Calculating...' : 'Next'}</span>
                    </button>
                </div>
            </div>
        </div>
    );

    // STEP 7: SYSTEM UPDATE (Was 6)
    const renderSystemUpdateStep = () => (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-white">{LABELS.constraintsTitle}</h2>
                <p className="text-zinc-500 text-sm">{LABELS.constraintsSubtitle}</p>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-8 pb-20">
                {state.patch?.reason && (
                    <div className="mb-6 p-4 border border-zinc-800 bg-zinc-900/50 text-xs text-zinc-400 leading-relaxed rounded-xl">
                        <span className="text-zinc-200 font-bold mr-2">Core Insight:</span> {state.patch.reason}
                    </div>
                )}

                {state.patch?.new_rules && state.patch.new_rules.length > 0 && (
                    <div className="space-y-4">
                        <div className={cn("flex items-center gap-2 pb-2 border-b text-xs font-bold uppercase tracking-wider", THEME.border, THEME.textSelected)}>
                            <Terminal className="w-4 h-4" />
                            <span>New Protocols</span>
                        </div>
                        {state.patch.new_rules.map((rule, i) => {
                            const isSelected = state.selectedRules.some(r => r.title === rule.title);
                            return (
                                <div key={i} className={cn("group relative p-6 border transition-all hover:bg-zinc-900/30 rounded-2xl", isSelected ? `${THEME.bgSelected} ${THEME.border}` : "border-zinc-800 bg-transparent opacity-60")}>
                                    <div className="flex items-start gap-4">
                                        <div onClick={() => toggleRule(rule)} className="cursor-pointer pt-1">
                                            <div className={cn(
                                                "w-5 h-5 border rounded-full flex items-center justify-center shrink-0 transition-colors",
                                                isSelected ? `${THEME.textSelected} border-current` : "border-zinc-700 text-transparent hover:border-zinc-500"
                                            )}>
                                                {isSelected && <Check className="w-3 h-3" />}
                                            </div>
                                        </div>
                                        <div className="flex-1 space-y-3">
                                            <input
                                                value={rule.title}
                                                onChange={(e) => updateRule(i, { ...rule, title: e.target.value })}
                                                className="w-full bg-transparent border-none p-0 text-base font-bold text-zinc-100 focus:outline-none focus:ring-0 placeholder:text-zinc-700"
                                            />
                                            <textarea
                                                value={rule.description}
                                                onChange={(e) => updateRule(i, { ...rule, description: e.target.value })}
                                                className="w-full bg-transparent border-none p-0 text-sm text-zinc-400 leading-relaxed focus:outline-none focus:ring-0 resize-none h-auto placeholder:text-zinc-700"
                                                rows={2}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {state.patch?.updated_rules && state.patch.updated_rules.length > 0 && (
                    <div className="space-y-4">
                        <div className={cn("flex items-center gap-2 pb-2 border-b text-xs font-bold uppercase tracking-wider", THEME.border, "text-blue-400")}>
                            <RefreshCw className="w-4 h-4" />
                            <span>Protocol Updates</span>
                        </div>
                        {state.patch.updated_rules.map((rule, i) => {
                            const isSelected = state.selectedUpdates.some(u => u.id === rule.id);
                            return (
                                <div key={rule.id} className={cn("group relative p-6 border rounded-2xl transition-all",
                                    isSelected
                                        ? "border-blue-500/30 bg-blue-950/10"
                                        : "border-zinc-800 bg-transparent opacity-60"
                                )}>
                                    <div className="flex items-start gap-4">
                                        {/* Toggle */}
                                        <div onClick={() => toggleUpdate(rule)} className="cursor-pointer pt-1">
                                            <div className={cn(
                                                "w-5 h-5 border rounded-full flex items-center justify-center shrink-0 transition-colors",
                                                isSelected ? "bg-blue-600 border-blue-600" : "border-zinc-700 text-transparent hover:border-zinc-500"
                                            )}>
                                                {isSelected && <Check className="w-3 h-3 text-white" />}
                                            </div>
                                        </div>

                                        <div className="flex-1 space-y-3">
                                            <div className="flex justify-between items-start">
                                                <h4 className={cn("text-base font-bold", isSelected ? "text-blue-200" : "text-zinc-500")}>{rule.title}</h4>
                                                <span className="text-[10px] uppercase font-bold text-blue-500 bg-blue-950/50 px-2 py-1 rounded">Refinement</span>
                                            </div>
                                            <p className="text-sm text-blue-300/80 leading-relaxed">
                                                {rule.description}
                                            </p>
                                            {rule.reason && (
                                                <div className="pt-2 mt-2 border-t border-blue-900/30 text-xs text-blue-500/60 font-mono">
                                                    Logic: {rule.reason}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center mt-8 pt-6 border-t border-zinc-800">
                <button onClick={prevStep} className="text-zinc-500 hover:text-white text-sm font-bold">Back</button>
                <button
                    onClick={handleFinish}
                    disabled={(!state.patch?.new_rules || state.patch.new_rules.length === 0) || isSubmitting}
                    className={cn("px-8 py-3 rounded-full text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2", THEME.button)}
                >
                    {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    <span>{isSubmitting ? 'Saving...' : 'Commit Changes'}</span>
                </button>
            </div>
        </div>
    );

    if (!isOpen) return null;

    return (
        <RecastShell mode={mode} step={state.step} onClose={onClose}>
            {isSubmitting ? (
                <RecastThinkingState />
            ) : (
                <>
                    {state.step === 1 && renderInputStep()}
                    {state.step === 2 && renderDiagnosisStep()}
                    {state.step === 3 && renderReversalStep()}
                    {state.step === 4 && renderCalibrationStep()}
                    {state.step === 5 && renderVisionStep()}
                    {state.step === 6 && renderSystemUpdateStep()}
                </>
            )}
            {error && (
                <div className="mt-8 p-4 bg-red-900/10 border border-red-900/50 text-red-400 text-xs rounded-xl text-center">
                    Error: {error}
                </div>
            )}
        </RecastShell>
    );
}
