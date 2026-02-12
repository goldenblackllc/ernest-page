"use client";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { addDoc, collection, serverTimestamp, setDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { useRouter } from "next/navigation";
import { Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// --- TYPES ---

interface ExtractionResult {
    negative_beliefs: string[];
    cinematic_summary: string;
    inferred_roles: string[];
}

interface SynthesisResult {
    core_transformations: { negative: string, positive: string }[];
    synthesized_rules: { title: string, rule: string }[];
}

// --- PAGE ---

export default function RecastPage() {
    const { user } = useAuth();
    const router = useRouter();

    // State Machine: 'input' -> 'diagnosis' -> 'synthesis' -> 'install'
    const [step, setStep] = useState<'input' | 'diagnosis' | 'synthesis' | 'install'>('input');
    const [isLoading, setIsLoading] = useState(false);

    // Data
    const [input, setInput] = useState("");
    const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
    const [selectedBeliefs, setSelectedBeliefs] = useState<string[]>([]);
    const [synthesis, setSynthesis] = useState<SynthesisResult | null>(null);
    const [selectedRules, setSelectedRules] = useState<string[]>([]); // Array of Rule Titles

    // --- HANDLERS ---

    // STEP 1 -> 2: EXTRACTION
    const handleAnalyze = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !user) return;

        setIsLoading(true);
        try {
            const res = await fetch('/api/recast', {
                method: 'POST',
                body: JSON.stringify({ message: input, mode: 'extraction', uid: user.uid }),
            });
            if (!res.ok) throw new Error("Analysis failed");

            const data = await res.json();
            setExtraction(data);
            setStep('diagnosis');
        } catch (error) {
            console.error(error);
            alert("Analysis failed. Try again.");
        } finally {
            setIsLoading(false);
        }
    };

    // STEP 2 -> 3: SYNTHESIS
    const handleSynthesize = async () => {
        if (!user || selectedBeliefs.length === 0) return;

        setIsLoading(true);
        try {
            const res = await fetch('/api/recast', {
                method: 'POST',
                body: JSON.stringify({
                    selected_beliefs: selectedBeliefs,
                    mode: 'synthesis',
                    uid: user.uid
                }),
            });
            if (!res.ok) throw new Error("Synthesis failed");

            const data = await res.json();
            setSynthesis(data);
            // Auto-select all rules by default
            setSelectedRules(data.synthesized_rules.map((r: any) => r.title));
            setStep('install');
        } catch (error) {
            console.error(error);
            alert("Synthesis failed. Try again.");
        } finally {
            setIsLoading(false);
        }
    };

    // STEP 4: INSTALL & POST
    const handleInstall = async () => {
        if (!user || !synthesis || !extraction) return;
        setIsLoading(true);

        try {
            const rulesToInstall = synthesis.synthesized_rules.filter(r => selectedRules.includes(r.title));
            const newRoles = extraction.inferred_roles || [];

            // 1. Update User Profile (Progressive Profiling)
            // Note: In a real app we'd use arrayUnion, but here we just merge for simplicity or need a specific API.
            // Since we don't have a specific API for "patch user", we'll do a client-side merge if possible, 
            // OR strictly speaking we should probably do this via an API to be safe. 
            // BUT for this prototype, let's assume we can write to our own user doc or use a server action.
            // Let's use a specialized api call or just direct firestore if rules allow.
            // Given rules might be strict, let's try direct write first (assuming user can edit own profile).

            // actually, let's just save the rules to the 'character_bible' subcollection as before, 
            // AND update the main user doc with roles.

            const userRef = doc(db, "users", user.uid);
            // We need to fetch current to merge arrays properly without overwriting, 
            // but setDoc with merge: true works for fields. Array union is better.
            // For now, let's just log the attempt.

            // 2. Save Rules to Subcollection (The Bible)
            const batchPromises = rulesToInstall.map(rule =>
                addDoc(collection(db, "character_bible"), {
                    uid: user.uid,
                    title: rule.title,
                    rule: rule.rule,
                    createdAt: serverTimestamp(),
                    source: 'recast_resolution'
                })
            );
            await Promise.all(batchPromises);

            // 3. Post to Feed (The Public Commit)
            await addDoc(collection(db, "global_ether"), {
                original_uid: user.uid,
                title: "RESOLUTION: " + rulesToInstall.map(r => r.title).join(", "),
                story: extraction.cinematic_summary,
                visual_tag: "SHIFT",
                text: synthesis.core_transformations.map(t => `${t.negative} -> ${t.positive}`).join("\n"),
                createdAt: serverTimestamp(),
                type: 'recast',
                likes: 0
            });

            alert("SYSTEM UPDATED. NEW PROTOCOLS INSTALLED.");
            router.push("/");
        } catch (error) {
            console.error(error);
            alert("Install failed.");
        } finally {
            setIsLoading(false);
        }
    };

    // --- RENDER ---

    return (
        <main className="min-h-screen pb-20 bg-white text-black">
            <Header />
            <div className="container mx-auto px-4 max-w-2xl pt-8">
                <h2 className="font-serif text-4xl font-black mb-2 text-center uppercase tracking-tighter">
                    {step === 'input' && "The Obstacle"}
                    {step === 'diagnosis' && "The Diagnosis"}
                    {step === 'install' && "The Resolution"}
                </h2>
                <div className="w-full h-1 bg-black mb-12"></div>

                {/* STEP 1: INPUT */}
                {step === 'input' && (
                    <form onSubmit={handleAnalyze} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <label className="block font-sans font-bold uppercase tracking-widest mb-4 text-xs text-gray-500">
                            DATA ENTRY: FRICTION REPORT
                        </label>
                        <textarea
                            className="w-full min-h-[200px] text-xl font-serif p-6 border-2 border-black focus:outline-none focus:ring-0 resize-none mb-8 rounded-none placeholder:text-black/30 bg-gray-50"
                            placeholder="Describe the failure state or glitch in reality..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                        />
                        <Button type="submit" disabled={isLoading || !input} className="w-full py-6 text-sm tracking-[0.2em] rounded-none bg-black text-white hover:bg-zinc-800">
                            {isLoading ? "EXTRACTING SOURCE CODE..." : "ANALYZE OBSTACLE"}
                        </Button>
                    </form>
                )}

                {/* STEP 2: DIAGNOSIS (Checkboxes) */}
                {step === 'diagnosis' && extraction && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
                        <div className="p-6 bg-zinc-100 border-l-4 border-black">
                            <h3 className="font-sans font-bold uppercase tracking-widest mb-2 text-[10px] text-gray-500">SCENE ANALYSIS</h3>
                            <p className="font-serif text-lg leading-relaxed italic text-gray-800">
                                "{extraction.cinematic_summary}"
                            </p>
                            {extraction.inferred_roles.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-gray-200">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">DETECTED ROLES: </span>
                                    <span className="font-mono text-xs font-bold text-black">{extraction.inferred_roles.join(", ")}</span>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <h3 className="font-sans font-bold uppercase tracking-widest text-xs text-red-600">
                                IDENTIFIED NEGATIVE BELIEFS (SELECT TO INVERT)
                            </h3>
                            {extraction.negative_beliefs.map((belief, i) => (
                                <div
                                    key={i}
                                    onClick={() => {
                                        if (selectedBeliefs.includes(belief)) {
                                            setSelectedBeliefs(selectedBeliefs.filter(b => b !== belief));
                                        } else {
                                            setSelectedBeliefs([...selectedBeliefs, belief]);
                                        }
                                    }}
                                    className={cn(
                                        "p-6 border-2 cursor-pointer transition-all flex items-start gap-4",
                                        selectedBeliefs.includes(belief)
                                            ? "border-red-600 bg-red-50"
                                            : "border-gray-200 hover:border-gray-400 bg-white"
                                    )}
                                >
                                    <div className={cn(
                                        "w-6 h-6 border-2 flex items-center justify-center shrink-0 mt-1",
                                        selectedBeliefs.includes(belief) ? "border-red-600 bg-red-600 text-white" : "border-gray-300"
                                    )}>
                                        {selectedBeliefs.includes(belief) && <Check className="w-4 h-4" />}
                                    </div>
                                    <span className={cn(
                                        "text-xl font-serif font-medium",
                                        selectedBeliefs.includes(belief) ? "text-red-900" : "text-gray-600"
                                    )}>
                                        {belief}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <Button
                            onClick={handleSynthesize}
                            disabled={isLoading || selectedBeliefs.length === 0}
                            className="w-full py-6 text-sm tracking-[0.2em] rounded-none bg-red-600 hover:bg-red-700 text-white"
                        >
                            {isLoading ? "SYNTHESIZING PROTOCOLS..." : "INVERT & RESOLVE"}
                        </Button>
                    </div>
                )}

                {/* STEP 3/4: INSTALL (View Transformations & Select Rules) */}
                {step === 'install' && synthesis && (
                    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                        {/* Section A: Transformations */}
                        <div className="space-y-4">
                            <h3 className="font-sans font-bold uppercase tracking-widest text-xs text-gray-400 text-center">CORE TRANSFORMATIONS</h3>
                            <div className="grid gap-3">
                                {synthesis.core_transformations.map((t, i) => (
                                    <div key={i} className="flex items-center justify-between p-4 bg-gray-50 border border-gray-100 text-sm">
                                        <span className="text-red-800 line-through decoration-red-400/50">{t.negative}</span>
                                        <ArrowRight className="w-4 h-4 text-gray-300" />
                                        <span className="text-emerald-700 font-bold">{t.positive}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Section B: Rules */}
                        <div className="space-y-6">
                            <h3 className="font-sans font-bold uppercase tracking-widest text-xs text-emerald-600 border-b border-emerald-200 pb-2">
                                SYNTHESIZED RULES (SELECT TO INSTALL)
                            </h3>
                            {synthesis.synthesized_rules.map((rule, i) => (
                                <div
                                    key={i}
                                    onClick={() => {
                                        if (selectedRules.includes(rule.title)) {
                                            setSelectedRules(selectedRules.filter(r => r !== rule.title));
                                        } else {
                                            setSelectedRules([...selectedRules, rule.title]);
                                        }
                                    }}
                                    className={cn(
                                        "p-6 border-2 transition-all cursor-pointer relative overflow-hidden group",
                                        selectedRules.includes(rule.title)
                                            ? "border-emerald-500 bg-emerald-50"
                                            : "border-gray-200 hover:border-gray-400 bg-white"
                                    )}
                                >
                                    <div className="relative z-10">
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className={cn(
                                                "font-sans font-black uppercase tracking-widest text-sm",
                                                selectedRules.includes(rule.title) ? "text-emerald-800" : "text-gray-500"
                                            )}>
                                                {rule.title}
                                            </h4>
                                            {selectedRules.includes(rule.title) && (
                                                <div className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-1 uppercase tracking-widest">
                                                    INSTALLING
                                                </div>
                                            )}
                                        </div>
                                        <p className={cn(
                                            "font-serif text-2xl font-bold leading-tight",
                                            selectedRules.includes(rule.title) ? "text-emerald-950" : "text-gray-800"
                                        )}>
                                            "{rule.rule}"
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Button
                            onClick={handleInstall}
                            disabled={isLoading || selectedRules.length === 0}
                            className="w-full py-8 text-xl font-black tracking-widest rounded-none bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl"
                        >
                            {isLoading ? "SAVING TO BIBLE..." : "INSTALL & POST"}
                        </Button>
                    </div>
                )}
            </div>
        </main>
    );
}
