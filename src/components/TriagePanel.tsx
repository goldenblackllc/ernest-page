"use client";

import React, { useState, useRef, useEffect } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { cn } from "@/lib/utils";
import { ProblemWizardModal } from "@/components/recast/ProblemWizardModal";
import { Plus, X, ArrowUp, Zap, AlertCircle, Target, Radio, Check, ArrowRight } from "lucide-react";

type AnalysisResult = {
    type: 'diagnostic' | 'blueprint_traits' | 'blueprint_prompts' | 'neutral';
    analysis?: string;
    narrative?: { title: string, story: string, visual_tag: string };
    target?: string;
    frequency?: string[];
    actions?: string[];
    traits?: string[];
    prompts?: { label: string, question: string }[];
};

// Removed legacy Extraction/Synthesis types as we defer to Wizard
type Mode = 'idle' | 'want' | 'problem' | 'next';

export function TriagePanel() {
    const { user } = useAuth();
    const [activeMode, setActiveMode] = useState<Mode>('idle');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [input, setInput] = useState("");
    const [broadcast, setBroadcast] = useState(true);

    // AI / Telemetry States
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Momentum/Next Logic
    const [momentumLines, setMomentumLines] = useState<string[]>([""]);

    // Recast State (Wizard)
    const [isProblemWizardOpen, setIsProblemWizardOpen] = useState(false);

    const resetPanel = () => {
        setActiveMode('idle');
        setIsMenuOpen(false);
        setInput("");
        setAnalysisResult(null);
        setMomentumLines([""]);
        setIsSubmitting(false);
        setIsAnalyzing(false);
        setBroadcast(true);
    };

    // Auto-focus logic
    useEffect(() => {
        if (activeMode !== 'idle' && !analysisResult) {
            setTimeout(() => {
                textareaRef.current?.focus();
            }, 100);
        }
    }, [activeMode, analysisResult]);

    // --- HANDLERS ---

    const handleModeSelect = (mode: Mode) => {
        if (mode === 'problem') {
            setIsProblemWizardOpen(true);
            setIsMenuOpen(false);
            return;
        }
        setActiveMode(mode);
        setIsMenuOpen(false); // Close the fan menu, open the modal logic
    };

    const handleSubmit = async () => {
        if (!user) return;

        // WHAT'S NEXT MODE: Commit lines (Direct Action)
        if (activeMode === 'next') {
            const validLines = momentumLines.filter(l => l.trim().length > 0);
            if (validLines.length === 0) return;

            setIsSubmitting(true);
            try {
                const batchPromises = validLines.map(title =>
                    addDoc(collection(db, "directives"), {
                        uid: user.uid,
                        title: title,
                        status: 'active',
                        type: 'QUEST', // Default for manual entry
                        createdAt: serverTimestamp(),
                        source: 'spark_next'
                    })
                );
                await Promise.all(batchPromises);
                resetPanel();
            } catch (e) {
                console.error(e);
                alert("Spark Failed.");
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        if (!input.trim()) return;



        // WANT MODE (Standard Telemetry)
        setIsAnalyzing(true);
        setAnalysisResult(null);

        // Define expected type for the API
        const analysisType = activeMode === 'want' ? 'blueprint_traits' : 'diagnostic';
        const contextPrefix = activeMode === 'want' ? "TARGET_DECLARATION: " : "FRICTION_REPORT: ";
        const finalPrompt = contextPrefix + input;

        try {
            const response = await fetch('/api/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: finalPrompt,
                    type: analysisType,
                    broadcast: broadcast,
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("Server Logic Failed:", errorData);
                throw new Error(errorData.error || "Analysis failed");
            }

            const result = await response.json();
            setAnalysisResult(result); // Show the analysis card (Blueprint or Diagnostic)

            // 1. Save Public Ether Log (if narrative returned)
            if (result.narrative) {
                await addDoc(collection(db, "global_ether"), {
                    original_uid: user.uid,
                    title: result.narrative.title || "SIGNAL",
                    story: result.narrative.story || result.narrative,
                    visual_tag: result.narrative.visual_tag || "DATA",
                    text: typeof result.narrative === 'string' ? result.narrative : (result.narrative.story || ""),
                    createdAt: serverTimestamp(),
                    type: 'signal',
                    likes: 0
                });
            }

            // 2. Save the PRIVATE log
            await addDoc(collection(db, "entries"), {
                uid: user.uid,
                text: input, // Raw input
                createdAt: serverTimestamp(),
                type: "telemetry",
                status: "active",
                mode: activeMode,
                analysis: result.analysis || null // Store the immediate analysis too?
            });

            setInput("");

        } catch (error: any) {
            console.error("Error:", error);
            alert(`UPLINK FAILED: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };



    const handleMomentumLineChange = (index: number, value: string) => {
        const newLines = [...momentumLines];
        newLines[index] = value;
        if (index === newLines.length - 1 && value.trim().length > 0) {
            newLines.push("");
        }
        setMomentumLines(newLines);
    };

    const handleInjectActions = async () => {
        if (!user || !analysisResult?.actions) return;
        setIsSubmitting(true);
        try {
            const batchPromises = analysisResult.actions.map(title =>
                addDoc(collection(db, "master_actions"), {
                    uid: user.uid,
                    title: title,
                    status: 'pending',
                    createdAt: serverTimestamp(),
                    source: 'ai_blueprint'
                })
            );
            await Promise.all(batchPromises);
            resetPanel();
        } catch (e) { console.error(e); } finally { setIsSubmitting(false); }
    }


    // --- RENDER ---

    return (
        <>
            {/* 1. THE SPARK TRIGGER (Fixed Bottom Center) */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
                <button
                    onClick={() => {
                        if (activeMode !== 'idle') resetPanel();
                        else setIsMenuOpen(!isMenuOpen);
                    }}
                    className={cn(
                        "w-16 h-16 rounded-full bg-zinc-950 text-white shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center justify-center transition-all duration-300 ring-1 ring-white/10 hover:ring-white/30",
                        isMenuOpen ? "rotate-45 scale-110 shadow-[0_0_30px_rgba(255,255,255,0.1)]" : "hover:scale-110 hover:shadow-[0_0_30px_rgba(255,255,255,0.1)] animate-pulse-slow active:scale-95"
                    )}
                >
                    {activeMode !== 'idle' ? <X className="w-8 h-8" /> : <Plus className="w-8 h-8" />}
                </button>
            </div>

            {/* 2. BACKDROP BLUR */}
            {(isMenuOpen || activeMode !== 'idle') && (
                <div
                    className="fixed inset-0 z-40 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={() => {
                        if (activeMode === 'idle') setIsMenuOpen(false);
                    }}
                />
            )}

            {/* 3. FAN OUT MENU */}
            {isMenuOpen && activeMode === 'idle' && (
                <div className="fixed bottom-28 left-1/2 -translate-x-1/2 flex flex-col gap-4 z-50 animate-in slide-in-from-bottom-10 zoom-in-95 duration-200 w-64">
                    <button
                        onClick={() => handleModeSelect('want')}
                        className="bg-zinc-900 border border-zinc-800 shadow-xl rounded-2xl py-4 px-6 flex items-center gap-4 text-left hover:scale-105 transition-transform group"
                    >
                        <div className="bg-blue-900/30 p-2 rounded-full text-blue-400 border border-blue-800/50 group-hover:bg-blue-800/50">
                            <Target className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-xs font-black uppercase tracking-widest text-blue-400">I WANT</div>
                            <div className="text-[10px] text-zinc-500 font-medium">Define a new target</div>
                        </div>
                    </button>

                    <button
                        onClick={() => handleModeSelect('problem')}
                        className="bg-zinc-900 border border-zinc-800 shadow-xl rounded-2xl py-4 px-6 flex items-center gap-4 text-left hover:scale-105 transition-transform group"
                    >
                        <div className="bg-red-900/30 p-2 rounded-full text-red-500 border border-red-800/50 group-hover:bg-red-800/50">
                            <AlertCircle className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-xs font-black uppercase tracking-widest text-red-500">PROBLEM</div>
                            <div className="text-[10px] text-zinc-500 font-medium">Rewire a limitation</div>
                        </div>
                    </button>

                    <button
                        onClick={() => handleModeSelect('next')}
                        className="bg-zinc-900 border border-zinc-800 shadow-xl rounded-2xl py-4 px-6 flex items-center gap-4 text-left hover:scale-105 transition-transform group"
                    >
                        <div className="bg-emerald-900/30 p-2 rounded-full text-emerald-500 border border-emerald-800/50 group-hover:bg-emerald-800/50">
                            <Zap className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-xs font-black uppercase tracking-widest text-emerald-500">GO</div>
                            <div className="text-[10px] text-zinc-500 font-medium">Quick task entry</div>
                        </div>
                    </button>
                </div>
            )}


            {/* 4. INPUT MODAL */}
            {activeMode !== 'idle' && (
                <div className="fixed bottom-0 left-0 right-0 top-0 z-50 flex items-center justify-center p-4 animate-in slide-in-from-bottom-10 fade-in duration-300 pointer-events-none">
                    <div className={cn(
                        "w-full max-w-lg overflow-hidden border shadow-2xl transition-all duration-300 pointer-events-auto flex flex-col max-h-[80vh]",
                        "bg-white rounded-3xl border-gray-100"
                    )}>
                        {/* Header */}
                        {/* Header */}
                        <div className={cn(
                            "px-6 py-6 flex justify-between items-center shrink-0",
                            activeMode === 'want' ? "bg-blue-50 border-b border-gray-100" :
                                "bg-emerald-50 border-b border-gray-100"
                        )}>
                            <span className={cn(
                                "tracking-widest",
                                activeMode === 'want' ? "text-xs font-bold uppercase text-blue-600" :
                                    "text-xs font-bold uppercase text-emerald-600"
                            )}>
                                {activeMode === 'want' ? "TARGET IDENTITY" : "MAKE A MOVE"}
                            </span>
                        </div>

                        {/* Analysis Result View - Blueprint Only */}
                        {analysisResult ? (
                            <div className="p-6 max-h-[60vh] overflow-y-auto">
                                {analysisResult.type === 'blueprint_traits' ? (
                                    <BlueprintFlow
                                        initialResult={analysisResult}
                                        originalInput={input}
                                        onCommit={async (commitment, traits) => {
                                            // 1. Save the COMMITMENT to master_actions (The "Routine" or Action)
                                            await addDoc(collection(db, "master_actions"), {
                                                uid: user?.uid,
                                                title: commitment,
                                                status: 'pending',
                                                createdAt: serverTimestamp(),
                                                source: 'method_acting'
                                            });

                                            // 2. Save the LOG ENTRY (The "Method Acting" Record)
                                            await addDoc(collection(db, "entries"), {
                                                uid: user?.uid,
                                                text: input, // The raw input (e.g. "I want money") - Hidden by default in feed
                                                traits: traits, // Validated traits
                                                commitment: commitment, // The final action/commitment
                                                mode: 'want',
                                                type: 'method_acting',
                                                createdAt: serverTimestamp(),
                                                // analysis: analysisResult // Optional: store full analysis
                                            });

                                            resetPanel();
                                        }} />
                                ) : (
                                    <>
                                        <p className="text-lg font-medium mb-6">{analysisResult.analysis}</p>
                                        <button onClick={resetPanel} className="w-full bg-black text-white py-4 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-gray-800 transition-colors">
                                            ACKNOWLEDGE
                                        </button>
                                    </>
                                )}
                            </div>
                        ) : (
                            /* Input View */
                            <div className="p-4 flex flex-col h-full">
                                {activeMode === 'next' ? (
                                    <div className="max-h-[50vh] overflow-y-auto p-4 space-y-2">
                                        {momentumLines.map((line, i) => (
                                            <input
                                                key={i}
                                                type="text"
                                                value={line}
                                                onChange={(e) => handleMomentumLineChange(i, e.target.value)}
                                                placeholder={`Task ${i + 1}...`}
                                                className="w-full bg-gray-50 border-b border-gray-200 py-3 px-2 focus:outline-none focus:border-emerald-500 text-lg font-medium"
                                                autoFocus={i === 0}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <textarea
                                        ref={textareaRef}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder={activeMode === 'want' ? "What do you desire?" : "What's the next action?"}
                                        className={cn(
                                            "w-full p-0 text-base leading-normal resize-none focus:outline-none min-h-[200px] flex-1",
                                            "bg-white text-black placeholder-gray-400"
                                        )}
                                    />
                                )}

                                <div className="p-4 pt-0 shrink-0">
                                    {(activeMode === 'want') && (
                                        <div className="flex items-center gap-2 mb-6 px-2">
                                            <button
                                                onClick={() => setBroadcast(!broadcast)}
                                                className={cn(
                                                    "flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors",
                                                    broadcast ? "text-black" : "text-gray-400"
                                                )}
                                            >
                                                <Radio className={cn("w-4 h-4", broadcast && "animate-pulse text-red-500")} />
                                                {broadcast ? "Broadcast to Ether" : "Private Only"}
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={handleSubmit}
                                            disabled={isSubmitting || (activeMode !== 'next' && !input.trim())}
                                            className={cn(
                                                "w-full py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:grayscale",
                                                activeMode === 'want' ? "bg-blue-500 hover:bg-blue-600 text-white rounded-xl shadow-md" :
                                                    "bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-md"
                                            )}
                                        >
                                            {isAnalyzing ? "ANALYZING..." : "SUBMIT"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ProblemWizardModal
                isOpen={isProblemWizardOpen}
                onClose={() => setIsProblemWizardOpen(false)}
            />
        </>
    );
}

// Sub-component for Blueprint Flow
// 3-Step Flow: Traits -> Prompts -> Action
// Sub-component for Blueprint Flow
function BlueprintFlow({ initialResult, originalInput, onCommit }: { initialResult: AnalysisResult, originalInput: string, onCommit: (action: string, traits: string[]) => void }) {
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // Step 1 State: Traits
    const [traits, setTraits] = useState<string[]>(initialResult.traits || ["", "", ""]);
    const [isEditingTraits, setIsEditingTraits] = useState(false);

    // Step 2 State: Prompts
    const [isLoadingPrompts, setIsLoadingPrompts] = useState(false);
    const [prompts, setPrompts] = useState<{ label: string, question: string }[]>([]);
    const [selectedPrompt, setSelectedPrompt] = useState<{ label: string, question: string } | null>(null);

    // Step 3 state
    const [actionInput, setActionInput] = useState("");

    const handleConfirmTraits = async () => {
        setIsLoadingPrompts(true);
        try {
            const contextInput = `DESIRE: ${originalInput}. CONFIRMED TRAITS: ${traits.join(", ")}`;
            const res = await fetch('/api/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: contextInput,
                    type: 'blueprint_prompts',
                    broadcast: false // internal step
                })
            });
            const data = await res.json();
            if (data.prompts) {
                setPrompts(data.prompts);
                setStep(2);
            }
        } catch (e) {
            console.error(e);
            alert("Failed to generate directions.");
        } finally {
            setIsLoadingPrompts(false);
        }
    };

    const updateTrait = (index: number, val: string) => {
        const newTraits = [...traits];
        newTraits[index] = val;
        setTraits(newTraits);
    };

    if (step === 1) {
        return (
            <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-300">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">REQUIRED TRAITS:</div>

                <div className="flex flex-col gap-3">
                    {traits.map((t, i) => (
                        <div key={i}>
                            {isEditingTraits ? (
                                <input
                                    value={t}
                                    onChange={(ev) => updateTrait(i, ev.target.value)}
                                    className="w-full text-center text-2xl font-black uppercase tracking-tight text-blue-600 border-b-2 border-blue-100 focus:border-blue-500 focus:outline-none bg-transparent"
                                />
                            ) : (
                                <div className="text-2xl font-black text-blue-600 tracking-tight uppercase">
                                    {t}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <button
                    onClick={() => setIsEditingTraits(!isEditingTraits)}
                    className="text-[10px] font-bold uppercase tracking-widest text-gray-300 hover:text-blue-400 underline decoration-dotted underline-offset-4"
                >
                    {isEditingTraits ? "Done Editing" : "ADJUST TRAITS"}
                </button>

                <button
                    onClick={handleConfirmTraits}
                    disabled={isLoadingPrompts}
                    className="w-full bg-black text-white py-4 rounded-xl text-xs font-bold uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
                >
                    {isLoadingPrompts ? "CALIBRATING..." : "CONFIRM IDENTITY"}
                </button>
            </div>
        );
    }

    if (step === 2) {
        return (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-10 duration-300">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 text-center mb-2">Stage Direction</div>
                <div className="grid grid-cols-1 gap-3">
                    {prompts.map((p, i) => (
                        <button
                            key={i}
                            onClick={() => { setSelectedPrompt(p); setStep(3); }}
                            className="bg-gray-50 hover:bg-blue-50 border-2 border-transparent hover:border-blue-200 py-4 px-6 rounded-xl text-left transition-all group"
                        >
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-500 group-hover:text-blue-600 block mb-1">
                                {p.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (step === 3 && selectedPrompt) {
        return (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-10 duration-300">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">{selectedPrompt.label}</div>
                    <div className="text-lg font-bold text-blue-900 leading-tight">{selectedPrompt.question}</div>
                </div>

                <textarea
                    value={actionInput}
                    onChange={(e) => setActionInput(e.target.value)}
                    placeholder="By the end of today, I will..."
                    className="w-full p-4 bg-gray-50 rounded-xl text-lg font-medium resize-none focus:outline-none focus:ring-2 focus:ring-black min-h-[100px]"
                    autoFocus
                />

                <button
                    onClick={() => onCommit(actionInput, traits)}
                    disabled={!actionInput.trim()}
                    className="w-full bg-blue-600 text-white py-4 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-lg shadow-blue-200"
                >
                    COMMIT TO CHARACTER
                </button>
            </div>
        );
    }

    return null;
}

function Button({ children, className, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
    return (
        <button
            className={cn(
                "font-bold uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 rounded-xl",
                variant === 'primary' ? "bg-red-600 text-white hover:bg-red-700 shadow-lg" : "bg-zinc-100 text-zinc-900 hover:bg-white",
                className
            )}
            {...props}
        >
            {children}
        </button>
    );
}
