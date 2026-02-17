import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRecastWizard } from '@/hooks/useRecastWizard';
import { RecastMode } from '@/types/recast';
import { X, Check, ArrowRight, RefreshCw, ChevronLeft, Pencil, Terminal, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/lib/auth/AuthContext';
import { createPost } from '@/lib/firebase/posts';
import { useRouter } from 'next/navigation';
import { Driver, Rule, Vision } from '@/types/recast';

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
            <div className="w-full h-full md:h-auto md:max-w-2xl bg-zinc-950 md:border border-zinc-800 md:shadow-2xl flex flex-col relative max-h-[90vh] rounded-lg overflow-hidden">
                {/* Header - CONSTANT */}
                <div className="h-16 border-b border-zinc-900 flex items-center justify-between px-8 shrink-0 bg-zinc-950">
                    <h2 className="text-xs tracking-[0.2em] text-zinc-500 uppercase font-bold">
                        {mode === 'PROBLEM' ? 'Recast Engine // Repair' : 'Recast Engine // Construct'}
                    </h2>
                    <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                            <div key={s} className={`h-1 rounded-full transition-all duration-300 ${s <= step ? (mode === 'PROBLEM' ? 'bg-red-900 w-4' : 'bg-amber-900 w-4') : 'bg-zinc-800 w-2'}`} />
                        ))}
                    </div>
                </div>

                {/* Close Button Absolute */}
                <button onClick={onClose} className="absolute top-5 right-6 text-zinc-600 hover:text-zinc-300 transition-colors z-10">
                    <X className="w-5 h-5" />
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
            title: "RECAST ENGINE",
            inputQuery: "What is the Glitch?",
            inputPlaceholder: "I feel stuck because...",
            inputHint: "Vent the raw emotion. Don't filter it.",
            step2Title: "DIAGNOSIS",
            step2Subtitle: "Identifying Core Negative Beliefs",
            driverLabel: "Shadow Belief",
            visionTitle: "THE REFRAME",
            visionSubtitle: "New Lenses for this Reality",
            constraintsTitle: "SYSTEM UPDATE",
            constraintsSubtitle: "Installing Corrective Rules"
        },
        DESIRE: {
            title: "REALITY ARCHITECT",
            inputQuery: "What is the Target?",
            inputPlaceholder: "I want to experience...",
            inputHint: "Describe the state you want to live in.",
            step2Title: "FUEL SOURCE",
            step2Subtitle: "Identifying Target Emotions",
            driverLabel: "Core Driver",
            visionTitle: "FUTURE MEMORY",
            visionSubtitle: "Lenses of the Target Reality",
            constraintsTitle: "MAINTENANCE PROTOCOL",
            constraintsSubtitle: "Installing Sustainability Rules"
        }
    }[mode];

    // Theme Colors
    const THEME = {
        PROBLEM: {
            accent: 'text-red-500',
            border: 'border-red-900/50',
            bgSelected: 'bg-red-950/20',
            textSelected: 'text-red-400',
            button: 'bg-red-600 hover:bg-red-700 text-white',
            ring: 'focus:ring-red-900'
        },
        DESIRE: {
            accent: 'text-amber-500',
            border: 'border-amber-900/50',
            bgSelected: 'bg-amber-950/20',
            textSelected: 'text-amber-400',
            button: 'bg-amber-600 hover:bg-amber-700 text-black',
            ring: 'focus:ring-amber-900'
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

            let dbRules = (bible.rules || []) as { id: string, rule: string, description?: string, category?: string, active?: boolean }[];

            // 2. Identify Removed Rules
            const deprecatedIds = state.patch?.deprecated_ids || [];
            let finalRules = dbRules.filter(dbRule => {
                const isDeprecated = deprecatedIds.includes(dbRule.id) || deprecatedIds.includes(dbRule.rule);
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

            finalRules = [...finalRules, ...newRuleObjects];

            // 4. Update Bible
            const updatedTitle = state.calibration.title || bible.title;
            const updatedSummary = state.calibration.summary || bible.summary;
            const newDriverStrings = state.selectedDrivers.map(d => d.id);

            const newActions = state.selectedVision.map(v => ({
                id: crypto.randomUUID(),
                action: v.title,
                category: 'recast',
                active: true
            }));

            await updateDoc(bibleRef, {
                "character_bible.title": updatedTitle,
                "character_bible.summary": updatedSummary,
                "character_bible.core_beliefs": arrayUnion(...newDriverStrings),
                "character_bible.rules": finalRules,
                "character_bible.visions": arrayUnion(...state.selectedVision.map(v => ({ title: v.title, description: v.description }))),
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
            const story = await generateGhostStory();

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

            const contentRaw = `${state.input_text}\n\n${footerText}`;
            const contentPublic = `${story || state.input_text}\n\n${footerText}`;

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
    const renderInputStep = () => (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <h2 className="text-3xl font-serif text-zinc-100 mb-2">{LABELS.inputQuery}</h2>
            <p className="text-zinc-500 mb-8 font-mono text-sm">{LABELS.inputHint}</p>

            <textarea
                className="flex-1 bg-zinc-900/30 border border-zinc-800 rounded-none p-6 text-xl text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-zinc-500 resize-none leading-relaxed font-serif"
                placeholder={LABELS.inputPlaceholder}
                value={state.input_text}
                onChange={(e) => setInputText(e.target.value)}
                autoFocus
            />

            <div className="flex justify-between items-center mt-8">
                <div className={`text-xs font-mono tracking-widest ${state.input_text.length < 20 ? 'text-red-900' : 'text-zinc-600'}`}>
                    {state.input_text.length} / 20 CHARS
                </div>
                <button
                    onClick={generateDiagnosis}
                    disabled={state.input_text.length < 20 || isLoading}
                    className="flex items-center gap-2 bg-white text-black px-8 py-4 uppercase tracking-[0.2em] text-xs font-bold hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    <span>{isLoading ? 'ANALYZING...' : 'INITIATE'}</span>
                </button>
            </div>
        </div>
    );

    // STEP 2: DIAGNOSIS
    const renderDiagnosisStep = () => (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-8">
                <h2 className="text-2xl font-serif text-zinc-100">{LABELS.step2Title}</h2>
                <p className="text-zinc-500 text-sm font-mono tracking-wide">{LABELS.step2Subtitle}</p>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                {state.generatedDrivers.map((driver) => {
                    const isSelected = state.selectedDrivers.some(d => d.id === driver.id);
                    return (
                        <motion.button
                            key={driver.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                                "w-full text-left p-6 border transition-all duration-200 group relative",
                                isSelected
                                    ? `${THEME.bgSelected} ${THEME.border} ${THEME.textSelected}`
                                    : "bg-transparent border-zinc-900 hover:border-zinc-800 text-zinc-400 hover:text-zinc-200"
                            )}
                            onClick={() => toggleDriver(driver)}
                        >
                            <div className="flex items-center justify-between">
                                <span className={cn("text-lg font-serif tracking-wide", isSelected ? "" : "opacity-70 group-hover:opacity-100")}>
                                    {driver.negative || driver.id}
                                </span>
                                {isSelected && <Check className={cn("w-5 h-5", THEME.accent)} />}
                            </div>
                        </motion.button>
                    );
                })}
            </div>

            <div className="flex justify-between items-center mt-8 pt-6 border-t border-zinc-900">
                <button onClick={prevStep} className="text-zinc-600 hover:text-zinc-400 text-xs font-bold tracking-widest uppercase">Back</button>
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => regenerateStep(2)}
                        disabled={isLoading}
                        className="text-[10px] font-bold uppercase tracking-widest text-zinc-700 hover:text-zinc-500 transition-colors"
                    >
                        Regenerate
                    </button>
                    <button
                        onClick={nextStep}
                        disabled={state.selectedDrivers.length === 0}
                        className={cn("px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] transition-colors disabled:opacity-50", THEME.button)}
                    >
                        CONFIRM
                    </button>
                </div>
            </div>
        </div>
    );

    // STEP 3: CALIBRATION
    const renderCalibrationStep = () => (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-8">
                <h2 className="text-2xl font-serif text-zinc-100">IDENTITY LOCK</h2>
                <p className="text-zinc-500 text-sm font-mono tracking-wide">Confirm your Avatar before generation.</p>
            </div>

            <div className="mb-8 p-8 border border-zinc-900 bg-zinc-950 rounded-none space-y-6">
                <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2 block">Archetype Title</label>
                    <input
                        value={state.calibration.title}
                        onChange={(e) => updateCalibration('title', e.target.value)}
                        className="w-full bg-zinc-900/50 border border-zinc-800 p-4 text-zinc-100 font-serif text-lg focus:border-zinc-600 focus:outline-none placeholder-zinc-800"
                        placeholder="e.g. The Architect"
                    />
                </div>
                <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2 block">Manifesto</label>
                    <textarea
                        value={state.calibration.summary}
                        onChange={(e) => updateCalibration('summary', e.target.value)}
                        className="w-full bg-zinc-900/50 border border-zinc-800 p-4 text-zinc-400 text-sm leading-relaxed focus:border-zinc-600 focus:outline-none resize-none h-32 placeholder-zinc-800"
                        placeholder="Briefly describe your ideal state..."
                    />
                </div>
            </div>

            <div className="flex justify-between items-center mt-8 pt-6 border-t border-zinc-900">
                <button onClick={prevStep} className="text-zinc-600 hover:text-zinc-400 text-xs font-bold tracking-widest uppercase">Back</button>
                <button
                    onClick={saveCalibration}
                    disabled={!state.calibration.title || !state.calibration.summary || isLoading}
                    className={cn("px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] transition-colors disabled:opacity-50 flex items-center gap-2", THEME.button)}
                >
                    {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    <span>{isLoading ? 'GENERATING...' : 'GENERATE VISION'}</span>
                </button>
            </div>
        </div>
    );

    // STEP 4: VISION
    const renderVisionStep = () => (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-8">
                <h2 className="text-2xl font-serif text-zinc-100">{LABELS.visionTitle}</h2>
                <p className="text-zinc-500 text-sm font-mono tracking-wide">{LABELS.visionSubtitle}</p>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {state.generatedVision.map((vision, i) => {
                    const isSelected = state.selectedVision.some(v => v.title === vision.title);
                    return (
                        <div
                            key={i}
                            onClick={() => toggleVision(vision)}
                            className={cn(
                                "p-6 border cursor-pointer flex flex-col gap-3 transition-all duration-300 group hover:bg-zinc-900/50",
                                isSelected
                                    ? `${THEME.bgSelected} ${THEME.border}`
                                    : "border-zinc-900 bg-transparent"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "w-4 h-4 border flex items-center justify-center shrink-0",
                                    isSelected ? `${THEME.textSelected} border-current` : "border-zinc-800 text-transparent"
                                )}>
                                    {isSelected && <Check className="w-3 h-3" />}
                                </div>
                                <h4 className={cn("text-sm font-bold uppercase tracking-widest", isSelected ? THEME.textSelected : "text-zinc-500")}>
                                    {vision.title}
                                </h4>
                            </div>
                            <p className="text-zinc-400 pl-7 font-serif leading-relaxed italic opacity-80 group-hover:opacity-100 text-lg">
                                "{vision.description}"
                            </p>
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-between items-center mt-8 pt-6 border-t border-zinc-900">
                <button onClick={prevStep} className="text-zinc-600 hover:text-zinc-400 text-xs font-bold tracking-widest uppercase">Back</button>
                <div className="flex items-center gap-6">
                    <button
                        onClick={() => regenerateStep(4)}
                        disabled={isLoading}
                        className="text-[10px] font-bold uppercase tracking-widest text-zinc-700 hover:text-zinc-500 transition-colors"
                    >
                        Regenerate
                    </button>
                    <button
                        onClick={generateConstraints}
                        disabled={state.selectedVision.length === 0 || isLoading}
                        className={cn("px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] transition-colors disabled:opacity-50", THEME.button)}
                    >
                        {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                        <span>{isLoading ? 'CALCULATING...' : 'GENERATE PLAN'}</span>
                    </button>
                </div>
            </div>
        </div>
    );

    // STEP 5: SYSTEM UPDATE
    const renderSystemUpdateStep = () => (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-8">
                <h2 className="text-2xl font-serif text-zinc-100">{LABELS.constraintsTitle}</h2>
                <p className="text-zinc-500 text-sm font-mono tracking-wide">{LABELS.constraintsSubtitle}</p>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-8 pb-20">
                {state.patch?.reason && (
                    <div className="mb-6 p-4 border border-zinc-900 bg-zinc-950/50 text-xs font-mono text-zinc-500 leading-relaxed uppercase tracking-wide">
                        <span className="text-zinc-400 font-bold mr-2">LOG:</span> {state.patch.reason}
                    </div>
                )}

                {state.patch?.new_rules && state.patch.new_rules.length > 0 && (
                    <div className="space-y-4">
                        <div className={cn("flex items-center gap-2 pb-2 border-b uppercase tracking-widest text-xs font-bold", THEME.border, THEME.textSelected)}>
                            <Terminal className="w-4 h-4" />
                            <span>New Protocols (Install)</span>
                        </div>
                        {state.patch.new_rules.map((rule, i) => {
                            const isSelected = state.selectedRules.some(r => r.title === rule.title);
                            return (
                                <div key={i} className={cn("group relative p-6 border transition-all hover:bg-zinc-900/30", isSelected ? `${THEME.bgSelected} ${THEME.border}` : "border-zinc-900 bg-transparent opacity-60")}>
                                    <div className="flex items-start gap-4">
                                        <div onClick={() => toggleRule(rule)} className="cursor-pointer pt-1">
                                            <div className={cn(
                                                "w-5 h-5 border flex items-center justify-center shrink-0 transition-colors",
                                                isSelected ? `${THEME.textSelected} border-current` : "border-zinc-800 text-transparent hover:border-zinc-600"
                                            )}>
                                                {isSelected && <Check className="w-3 h-3" />}
                                            </div>
                                        </div>
                                        <div className="flex-1 space-y-3">
                                            <input
                                                value={rule.title}
                                                onChange={(e) => updateRule(i, { ...rule, title: e.target.value })}
                                                className="w-full bg-transparent border-none p-0 text-sm font-bold font-mono text-zinc-200 focus:outline-none focus:ring-0 placeholder:text-zinc-700 uppercase tracking-wide"
                                            />
                                            <textarea
                                                value={rule.description}
                                                onChange={(e) => updateRule(i, { ...rule, description: e.target.value })}
                                                className="w-full bg-transparent border-none p-0 text-sm text-zinc-400 leading-relaxed focus:outline-none focus:ring-0 resize-none h-auto placeholder:text-zinc-700 font-serif"
                                                rows={2}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center mt-8 pt-6 border-t border-zinc-900">
                <button onClick={prevStep} className="text-zinc-600 hover:text-zinc-400 text-xs font-bold tracking-widest uppercase">Back</button>
                <button
                    onClick={handleFinish}
                    disabled={(!state.patch?.new_rules || state.patch.new_rules.length === 0) || isSubmitting}
                    className={cn("px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] transition-colors disabled:opacity-50 flex items-center gap-2", THEME.button)}
                >
                    {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    <span>{isSubmitting ? 'COMMITTING...' : 'COMMIT UPDATE'}</span>
                </button>
            </div>
        </div>
    );

    if (!isOpen) return null;

    return (
        <RecastShell mode={mode} step={state.step} onClose={onClose}>
            {state.step === 1 && renderInputStep()}
            {state.step === 2 && renderDiagnosisStep()}
            {state.step === 3 && renderCalibrationStep()}
            {state.step === 4 && renderVisionStep()}
            {state.step === 5 && renderSystemUpdateStep()}
            {error && (
                <div className="mt-8 p-4 bg-red-950/20 border border-red-900/50 text-red-400 text-xs font-mono tracking-wide text-center uppercase">
                    Error: {error}
                </div>
            )}
        </RecastShell>
    );
}
