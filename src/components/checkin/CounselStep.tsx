import React from 'react';
import { Sparkles, X } from 'lucide-react';
import { CheckInState } from './CheckInWizardModal';

interface CounselStepProps {
    state: CheckInState;
    onClose: () => void;
}

export default function CounselStep({ state, onClose }: CounselStepProps) {
    return (
        <div className="flex flex-col h-full items-center justify-center animate-in zoom-in-95 duration-500 min-h-[400px]">
            {/* Stylized Loading Indicator */}
            <div className="relative w-32 h-32 flex items-center justify-center mb-8">
                {/* Core Orb */}
                <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-pulse shadow-[0_0_50px_rgba(16,185,129,0.2)]" />
                <div className="absolute w-20 h-20 bg-emerald-500/30 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
                <div className="absolute w-12 h-12 bg-emerald-500/40 rounded-full animate-pulse" style={{ animationDuration: '1.5s' }} />

                {/* Sparkle Icon */}
                <Sparkles className="w-8 h-8 text-emerald-400 relative z-10 animate-pulse" />
            </div>

            <h2 className="text-xl font-bold tracking-widest text-white uppercase text-center mb-4">
                Consulting your Ideal Character...
            </h2>
            <p className="text-zinc-500 text-sm max-w-sm text-center">
                Processing the reality anchor. Generating the next set of active directives.
            </p>

            {/* Temporary Close Button for Phase 2 scaffold */}
            <div className="mt-12">
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-white uppercase tracking-widest transition-colors"
                >
                    <X className="w-4 h-4" /> Cancel Consultation
                </button>
            </div>
        </div>
    );
}
