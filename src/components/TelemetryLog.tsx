"use client";

import { useState, useRef } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";

type AnalysisResult = {
    type: 'diagnostic' | 'blueprint' | 'neutral';
    analysis?: string;
    target?: string;
    frequency?: string[];
    actions?: string[];
};

export function TelemetryLog() {
    const { user } = useAuth();
    const [input, setInput] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = async () => {
        if (!input.trim() || !user) return;

        setIsAnalyzing(true);
        setAnalysisResult(null);

        try {
            // Call AI Router
            const response = await fetch('/api/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input: input })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("API Error Details:", errorData);
                throw new Error(errorData.details || errorData.error || "Analysis failed");
            }

            const result = await response.json();
            setAnalysisResult(result);

        } catch (error: any) {
            console.error("Error analyzing telemetry:", error);
            alert(`UPLINK FAILED: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSaveLog = async () => {
        if (!user || !input.trim()) return;
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, "entries"), {
                uid: user.uid,
                text: input,
                createdAt: serverTimestamp(),
                type: "telemetry",
                status: "active"
            });
            setInput("");
            setAnalysisResult(null);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRefine = () => {
        setAnalysisResult(null);
        textareaRef.current?.focus();
    };

    const handleInjectActions = async () => {
        if (!user || !analysisResult?.actions) return;
        setIsSubmitting(true);
        try {
            // 1. Save Actions to Master List
            const batchPromises = analysisResult.actions.map(actionTitle =>
                addDoc(collection(db, "master_actions"), {
                    uid: user.uid,
                    title: actionTitle,
                    status: 'pending',
                    createdAt: serverTimestamp(),
                    source: 'ai_blueprint'
                })
            );
            await Promise.all(batchPromises);

            // 2. Save Log Entry
            await addDoc(collection(db, "entries"), {
                uid: user.uid,
                text: input, // The original blueprint text
                createdAt: serverTimestamp(),
                type: "telemetry",
                status: "processed_blueprint"
            });

            setInput("");
            setAnalysisResult(null);
        } catch (e) {
            console.error(e);
            alert("INJECTION FAILED.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <section className="bg-white border-2 border-black p-0 mb-0 relative">
            {/* Header Bar */}
            <div className="bg-black text-white px-4 py-2 text-[10px] uppercase tracking-widest font-bold flex justify-between items-center">
                <span>TELEMETRY LOG</span>
                {isAnalyzing && <span className="animate-pulse">ANALYZING TELEMETRY...</span>}
            </div>

            {/* Input Area */}
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Log an anomaly, state the friction, or define a target..."
                className="w-full text-lg p-6 border-none focus:ring-0 resize-y min-h-[160px] font-sans placeholder:text-gray-300 text-black"
                disabled={isSubmitting || isAnalyzing || !!analysisResult}
            />

            {/* Action Footer (Only show if not analyzing and no result) */}
            {!analysisResult && (
                <div className="flex justify-end border-t-2 border-black">
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || isAnalyzing}
                        className="bg-white text-black border-l-2 border-black px-8 py-4 text-xs font-bold uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isAnalyzing ? "TRANSMITTING..." : "SUBMIT"}
                    </button>
                </div>
            )}

            {/* AI Response Cards */}
            {analysisResult && (
                <div className="border-t-2 border-black animate-in slide-in-from-top-2 duration-300">

                    {/* CARD TYPE: DIAGNOSTIC */}
                    {analysisResult.type === 'diagnostic' && (
                        <div className="bg-black text-white p-6">
                            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-4">
                                [ SYSTEM DIAGNOSTIC ]
                            </div>
                            <p className="text-xl font-bold uppercase leading-tight mb-8">
                                {analysisResult.analysis}
                            </p>
                            <div className="flex gap-4">
                                <button
                                    onClick={handleSaveLog}
                                    disabled={isSubmitting}
                                    className="flex-1 bg-white text-black px-4 py-3 text-xs font-bold uppercase tracking-widest hover:bg-gray-200"
                                >
                                    ACCURATE
                                </button>
                                <button
                                    onClick={handleRefine}
                                    className="flex-none border-2 border-white text-white px-4 py-3 text-xs font-bold uppercase tracking-widest hover:bg-white hover:text-black"
                                >
                                    REFINE
                                </button>
                            </div>
                        </div>
                    )}

                    {/* CARD TYPE: BLUEPRINT */}
                    {analysisResult.type === 'blueprint' && (
                        <div className="bg-white text-black p-6 border-b-2 border-black">
                            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-4">
                                [ TARGET ACQUIRED ]
                            </div>

                            <h3 className="text-3xl font-black uppercase mb-2 tracking-tighter">
                                {analysisResult.target}
                            </h3>

                            <div className="mb-6 text-xs font-bold uppercase tracking-widest text-gray-500">
                                FREQUENCY: {analysisResult.frequency?.join(" / ")}
                            </div>

                            <ul className="mb-8 space-y-2 border-l-2 border-black pl-4">
                                {analysisResult.actions?.map((action, i) => (
                                    <li key={i} className="text-sm font-bold uppercase">
                                        {i + 1}. {action}
                                    </li>
                                ))}
                            </ul>

                            <button
                                onClick={handleInjectActions}
                                disabled={isSubmitting}
                                className="w-full bg-black text-white px-4 py-4 text-xs font-bold uppercase tracking-[0.2em] hover:bg-gray-800 transition-colors"
                            >
                                [ INJECT ACTIONS TO MASTER LIST ]
                            </button>
                        </div>
                    )}

                    {/* Fallback for Neutral? Just treat as generic or allow save */}
                    {analysisResult.type === 'neutral' && (
                        <div className="bg-gray-100 p-4 text-center">
                            <p className="text-xs uppercase tracking-widest mb-4">NO ANOMALIES DETECTED.</p>
                            <button onClick={handleSaveLog} className="bg-black text-white px-4 py-2 text-xs font-bold uppercase tracking-widest">LOG ENTRY</button>
                        </div>
                    )}

                </div>
            )}
        </section>
    );
}
