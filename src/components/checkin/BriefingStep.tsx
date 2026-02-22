import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { CheckInState } from './CheckInWizardModal';
import { cn } from '@/lib/utils';

interface BriefingStepProps {
    state: CheckInState;
    setState: React.Dispatch<React.SetStateAction<CheckInState>>;
    onNext: () => void;
    onBack: () => void;
}

export default function BriefingStep({ state, setState, onNext, onBack }: BriefingStepProps) {
    const isReady = state.briefing.trim().length > 10; // Basic validation

    return (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-6 space-y-1">
                <h2 className="text-2xl font-bold tracking-tight text-white">The Briefing</h2>
                <p className="text-sm font-medium text-zinc-500">What's going on?</p>
            </div>

            <div className="flex-1 flex flex-col gap-4">
                <div className="space-y-3 flex-1 flex flex-col">
                    <p className="text-sm text-zinc-500">What has happened since the last check-in? Dump the challenges, wins, and thoughts here.</p>
                    <textarea
                        value={state.briefing}
                        onChange={(e) => setState(prev => ({ ...prev, briefing: e.target.value }))}
                        placeholder="e.g. I had a great meeting today but I'm feeling stressed about the upcoming deadline..."
                        className="flex-1 w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-zinc-200 text-lg leading-relaxed focus:border-zinc-500 focus:outline-none min-h-[200px] resize-none"
                    />
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center pt-6 mt-2 border-t border-zinc-800 shrink-0">
                    <button onClick={onBack} className="text-zinc-500 hover:text-white text-sm font-medium px-4 py-2 transition-colors">
                        Back
                    </button>
                    <button
                        onClick={onNext}
                        disabled={!isReady}
                        className={cn(
                            "px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2",
                            !isReady
                                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                        )}
                    >
                        <span>Consult Character</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
