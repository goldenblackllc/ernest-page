import React, { useEffect, useRef } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { CheckInState } from './CheckInWizardModal';
import { useCompletion } from '@ai-sdk/react';
import ReactMarkdown from 'react-markdown';
import { auth } from '@/lib/firebase/config';

interface CounselStepProps {
    state: CheckInState;
    setState: React.Dispatch<React.SetStateAction<CheckInState>>;
    onNext: () => void;
}

export default function CounselStep({ state, setState, onNext }: CounselStepProps) {
    const { completion, complete, isLoading, error } = useCompletion({
        api: '/api/checkin/counsel',
    });

    const hasFetched = useRef(false);

    useEffect(() => {
        if (!hasFetched.current && auth.currentUser) {
            hasFetched.current = true;
            complete('', {
                body: {
                    uid: auth.currentUser.uid,
                    timeAgo: "24 hours", // Hardcoded for daily check-in, or pull from user record
                    alignmentScore: state.alignmentScore,
                    gapText: state.gap,
                    briefingText: state.briefing,
                    completedTasks: "unknown" // Can improve later
                }
            }).then((result) => {
                if (result) {
                    setState(prev => ({ ...prev, counsel: result }));
                }
            });
        }
    }, [complete, state, setState]);

    // Handle when completion finishes via hook updates (fallback if promise result misses it)
    useEffect(() => {
        if (!isLoading && completion && completion !== state.counsel) {
            setState(prev => ({ ...prev, counsel: completion }));
        }
    }, [isLoading, completion, setState, state.counsel]);

    return (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-6 space-y-1">
                <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-emerald-500" />
                    The Counsel
                </h2>
                <p className="text-sm font-medium text-zinc-500">Wisdom from your Ideal Character</p>
            </div>

            <div className="flex-1 overflow-y-auto mb-6 custom-scrollbar pr-2">
                {error && (
                    <div className="p-4 bg-red-950/50 border border-red-900/50 rounded-xl text-red-400 text-sm">
                        Error generating counsel: {error.message}
                    </div>
                )}

                {!completion && isLoading && (
                    <div className="flex items-center justify-center py-12">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center animate-pulse">
                            <div className="w-4 h-4 rounded-full bg-emerald-500/40 animate-ping" />
                        </div>
                    </div>
                )}

                {completion && (
                    <div className="prose prose-invert prose-emerald max-w-none text-zinc-300">
                        <ReactMarkdown>{completion}</ReactMarkdown>
                    </div>
                )}
            </div>

            <div className="flex justify-end items-center pt-6 border-t border-zinc-800 shrink-0">
                <button
                    onClick={onNext}
                    disabled={isLoading || !completion}
                    className="px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:shadow-none"
                >
                    <span>View Action Plan</span>
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
