"use client";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import RecastWizardModal from "@/components/recast/RecastWizardModal";
import { Sparkles } from "lucide-react";

export default function RecastPage() {
    const [isWizardOpen, setIsWizardOpen] = useState(false);

    return (
        <main className="min-h-screen bg-black text-white">
            <Header />

            <div className="container mx-auto px-4 h-[calc(100vh-80px)] flex flex-col items-center justify-center">
                <div className="max-w-xl text-center space-y-8 animate-in fade-in zoom-in duration-700">

                    <div className="mx-auto w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800 shadow-2xl shadow-red-900/20">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>

                    <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none">
                        Problem<br />Recast
                    </h1>

                    <p className="text-xl text-zinc-400 max-w-md mx-auto leading-relaxed">
                        Turn your friction into fuel. A 6-step protocol to debug your reality and install new operating rules.
                    </p>

                    <Button
                        onClick={() => setIsWizardOpen(true)}
                        className="px-10 py-8 text-lg font-black tracking-[0.2em] uppercase bg-white text-black hover:bg-zinc-200 rounded-none transform transition-all hover:scale-105"
                    >
                        Initialize Protocol
                    </Button>
                </div>
            </div>

            <RecastWizardModal
                isOpen={isWizardOpen}
                onClose={() => setIsWizardOpen(false)}
                mode="PROBLEM"
            />
        </main>
    );
}
