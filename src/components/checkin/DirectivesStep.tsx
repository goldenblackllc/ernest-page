import React, { useEffect, useState, useRef } from 'react';
import { Target, ArrowRight, CheckSquare } from 'lucide-react';
import { CheckInState } from './CheckInWizardModal';
import { auth } from '@/lib/firebase/config';

interface DirectivesStepProps {
    state: CheckInState;
    setState: React.Dispatch<React.SetStateAction<CheckInState>>;
    onNext: () => void;
}

export default function DirectivesStep({ state, setState, onNext }: DirectivesStepProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const hasFetched = useRef(false);

    useEffect(() => {
        if (!hasFetched.current && state.counsel && state.directives.length === 0 && auth.currentUser) {
            hasFetched.current = true;
            setIsLoading(true);

            fetch('/api/checkin/directives', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: auth.currentUser.uid, // Pass UID to fetch character bible
                    counsel: state.counsel,
                    briefing: state.briefing // Pass the daily reality to ground the generated tasks
                })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.error) {
                        setError(data.error);
                    } else if (data.directives) {
                        setState(prev => ({ ...prev, directives: data.directives }));
                    }
                })
                .catch(err => setError(err.message))
                .finally(() => setIsLoading(false));
        }
    }, [state.counsel, state.directives.length, setState]);

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
                {error && (
                    <div className="p-4 bg-red-950/50 border border-red-900/50 rounded-xl text-red-400 text-sm">
                        Error generating directives: {error}
                    </div>
                )}

                {isLoading && state.directives.length === 0 && (
                    <div className="flex items-center justify-center py-12 flex-col gap-4">
                        <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                        <p className="text-sm text-zinc-500 animate-pulse">Distilling tasks...</p>
                    </div>
                )}

                {!isLoading && state.directives.length > 0 && (
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
                    Step 2 of 3
                </p>
                <button
                    onClick={onNext}
                    disabled={isLoading || state.directives.length === 0}
                    className="px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:shadow-none"
                >
                    <span>Draft Public Post</span>
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
