import React, { useState } from 'react';
import { X } from 'lucide-react';
import AuditStep from './AuditStep';
import BriefingStep from './BriefingStep';
import CounselStep from './CounselStep';
import DirectivesStep from './DirectivesStep';
import PostStep from './PostStep';

interface CheckInWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export type CheckInState = {
    step: 1 | 2 | 3 | 4 | 5;
    alignmentScore: number;
    gap: string;
    briefing: string;
    // New fields to hold the sequential API outputs
    counsel: string;
    directives: string[];
    post: { tension: string; counsel: string } | null;
};

export default function CheckInWizardModal({ isOpen, onClose }: CheckInWizardModalProps) {
    const [state, setState] = useState<CheckInState>({
        step: 1,
        alignmentScore: 50,
        gap: '',
        briefing: '',
        counsel: '',
        directives: [],
        post: null
    });

    if (!isOpen) return null;

    const nextStep = () => setState(prev => ({ ...prev, step: Math.min(prev.step + 1, 5) as 1 | 2 | 3 | 4 | 5 }));
    const prevStep = () => setState(prev => ({ ...prev, step: Math.max(prev.step - 1, 1) as 1 | 2 | 3 | 4 | 5 }));

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full h-full md:h-auto md:max-w-2xl bg-zinc-950 md:border border-zinc-800 md:shadow-2xl flex flex-col relative max-h-[90vh] md:rounded-3xl overflow-hidden font-sans">
                {/* Header */}
                <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 shrink-0 bg-zinc-900/50">
                    <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-widest">
                        Daily Check-In
                    </h2>
                    <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                            <div key={s} className={`h-1 rounded-full transition-all duration-300 ${s <= state.step ? 'bg-emerald-500 w-4' : 'bg-zinc-800 w-2'}`} />
                        ))}
                    </div>
                </div>

                {/* Close Button Absolute */}
                <button onClick={onClose} className="absolute top-5 right-6 text-zinc-500 hover:text-white transition-colors z-10 bg-zinc-800/50 rounded-full p-1">
                    <X className="w-4 h-4" />
                </button>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
                    {state.step === 1 && (
                        <AuditStep
                            state={state}
                            setState={setState}
                            onNext={nextStep}
                            onCancel={onClose}
                        />
                    )}
                    {state.step === 2 && (
                        <BriefingStep
                            state={state}
                            setState={setState}
                            onNext={nextStep}
                            onBack={prevStep}
                        />
                    )}
                    {state.step === 3 && (
                        <CounselStep
                            state={state}
                            setState={setState}
                            onNext={nextStep}
                        />
                    )}
                    {state.step === 4 && (
                        <DirectivesStep
                            state={state}
                            setState={setState}
                            onNext={nextStep}
                        />
                    )}
                    {state.step === 5 && (
                        <PostStep
                            state={state}
                            setState={setState}
                            onClose={onClose}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
