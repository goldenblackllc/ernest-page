import React from 'react';
import { Target, ArrowRight, CheckSquare, Sparkles } from 'lucide-react';
import { CheckInState } from './CheckInWizardModal';
import { auth } from '@/lib/firebase/config';

interface DirectivesStepProps {
    state: CheckInState;
    onClose: () => void;
}

export default function DirectivesStep({ state, onClose }: DirectivesStepProps) {

    const handleAccept = () => {
        // Instantly dismiss the wizard for a snappy UX
        onClose();

        // Fire-and-forget background publication and DB save
        if (auth.currentUser) {
            // Dispatch event to show a loading state in the Ledger feed
            window.dispatchEvent(new CustomEvent('checkin-publishing-start'));

            fetch('/api/checkin/post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: auth.currentUser.uid,
                    briefing: state.briefing,
                    counsel: state.counsel,
                    directives: state.directives
                })
            })
                .catch(e => console.error("Background publish failed:", e))
                .finally(() => {
                    // Clear the loading state whether it succeeds or fails
                    window.dispatchEvent(new CustomEvent('checkin-publishing-end'));
                });
        }
    };

    return (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-6 space-y-1">
                <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                    <Target className="w-6 h-6 text-emerald-500" />
                    The Directives
                </h2>
                <p className="text-sm font-medium text-zinc-500">Your Action Plan</p>
            </div>

            <div className="flex-1 overflow-y-auto mb-6 custom-scrollbar pr-2">
                {state.directives.length === 0 ? (
                    <div className="flex items-center justify-center py-12 flex-col gap-4 text-center">
                        <p className="text-sm text-zinc-500 animate-pulse">No directives were generated.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {state.directives.map((directive, index) => (
                            <div key={index} className="flex items-start gap-3 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/80 group hover:border-emerald-900/50 transition-colors">
                                <div className="mt-0.5 text-zinc-600 group-hover:text-emerald-500 transition-colors">
                                    <CheckSquare className="w-5 h-5" />
                                </div>
                                <p className="text-zinc-300 text-[15px] leading-relaxed">
                                    {directive}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center pt-6 border-t border-zinc-800 shrink-0">
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
                    Step 2 of 2
                </p>
                <button
                    onClick={handleAccept}
                    disabled={state.directives.length === 0}
                    className="px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:shadow-none"
                >
                    <span>Accept & Publish</span>
                    <Sparkles className="w-4 h-4 ml-1" />
                </button>
            </div>
        </div>
    );
}
