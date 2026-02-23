import React, { useEffect, useState, useRef } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { CheckInState } from './CheckInWizardModal';
import ReactMarkdown from 'react-markdown';
import { auth } from '@/lib/firebase/config';

interface CounselStepProps {
    state: CheckInState;
    setState: React.Dispatch<React.SetStateAction<CheckInState>>;
    onNext: () => void;
    onBack: () => void;
}

export default function CounselStep({ state, setState, onNext, onBack }: CounselStepProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const hasFetched = useRef(false);

    useEffect(() => {
        if (!hasFetched.current && auth.currentUser && !state.counsel) {
            hasFetched.current = true;
            setIsLoading(true);

            fetch('/api/checkin/counsel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: auth.currentUser.uid,
                    rant: state.rant
                })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.error) {
                        setError(data.error);
                    } else if (data.counsel && data.directives) {
                        setState(prev => ({
                            ...prev,
                            counsel: data.counsel,
                            directives: data.directives // Capture the sequentially generated directives!
                        }));
                    }
                })
                .catch(err => setError(err.message))
                .finally(() => setIsLoading(false));
        }
    }, [state.counsel, state.rant, setState]);

    // If still actively loading the monolithic block, show the immersive spinner
    if (isLoading && !state.counsel) {
        return (
            <div className="flex flex-col h-full items-center justify-center animate-in fade-in duration-500 min-h-[400px]">
                <div className="relative w-32 h-32 flex items-center justify-center mb-8">
                    <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-pulse shadow-[0_0_50px_rgba(16,185,129,0.2)]" />
                    <div className="absolute w-20 h-20 bg-emerald-500/30 rounded-full animate-ping" style={{ animationDuration: '3s' }} />
                    <div className="absolute w-12 h-12 bg-emerald-500/40 rounded-full animate-pulse" style={{ animationDuration: '1.5s' }} />
                    <Sparkles className="w-8 h-8 text-emerald-400 relative z-10 animate-pulse" />
                </div>
                <h2 className="text-xl font-bold tracking-widest text-white uppercase text-center mb-4 animate-pulse">
                    Consulting Character Bible...
                </h2>
                <p className="text-zinc-500 text-sm max-w-sm text-center">
                    Generating holistic counsel and distilling active 24-hour directives...
                </p>
            </div>
        );
    }

    // Once loaded, show the standard text review screen
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
                        Error generating generation: {error}
                    </div>
                )}

                {state.counsel && (
                    <div className="prose prose-invert prose-emerald max-w-none text-zinc-300">
                        <ReactMarkdown>{state.counsel}</ReactMarkdown>
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center pt-6 border-t border-zinc-800 shrink-0 gap-3">
                <button
                    onClick={onBack}
                    className="px-6 py-2.5 rounded-full text-sm font-bold transition-all text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                    Back
                </button>
                <div className="flex items-center gap-4">
                    <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider hidden sm:block">
                        Step 2 of 3
                    </p>
                    <button
                        onClick={onNext}
                        disabled={!state.counsel}
                        className="px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:shadow-none"
                    >
                        <span>View Action Plan</span>
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
