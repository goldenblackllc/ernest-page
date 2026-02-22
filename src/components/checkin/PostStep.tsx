import React, { useEffect, useState, useRef } from 'react';
import { Globe, Check } from 'lucide-react';
import { CheckInState } from './CheckInWizardModal';

interface PostStepProps {
    state: CheckInState;
    setState: React.Dispatch<React.SetStateAction<CheckInState>>;
    onClose: () => void;
}

export default function PostStep({ state, setState, onClose }: PostStepProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const hasFetched = useRef(false);

    useEffect(() => {
        if (!hasFetched.current && state.counsel && state.briefing && !state.post) {
            hasFetched.current = true;
            setIsLoading(true);

            fetch('/api/checkin/post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    my_story: "My current reality", // Alternatively pass from context/app state if available globally
                    briefing: state.briefing,
                    counsel: state.counsel
                })
            })
                .then(res => res.json())
                .then(data => {
                    if (data.error) {
                        setError(data.error);
                    } else if (data.post) {
                        setState(prev => ({ ...prev, post: data.post }));
                    }
                })
                .catch(err => setError(err.message))
                .finally(() => setIsLoading(false));
        }
    }, [state.counsel, state.briefing, state.post, setState]);

    return (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-6 space-y-1">
                <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                    <Globe className="w-6 h-6 text-emerald-500" />
                    Public Post
                </h2>
                <p className="text-sm font-medium text-zinc-500">Anonymized wisdom for the community</p>
            </div>

            <div className="flex-1 overflow-y-auto mb-6 custom-scrollbar pr-2">
                {error && (
                    <div className="p-4 bg-red-950/50 border border-red-900/50 rounded-xl text-red-400 text-sm">
                        Error generating post: {error}
                    </div>
                )}

                {isLoading && !state.post && (
                    <div className="flex items-center justify-center py-12 flex-col gap-4">
                        <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                        <p className="text-sm text-zinc-500 animate-pulse">Drafting post...</p>
                    </div>
                )}

                {!isLoading && state.post && (
                    <div className="space-y-6 bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6">
                        <div className="space-y-2">
                            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">The Tension</h3>
                            <p className="text-zinc-300 text-sm leading-relaxed italic border-l-2 border-zinc-700 pl-4 py-1">
                                "{state.post.tension}"
                            </p>
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-xs font-bold text-emerald-500/80 uppercase tracking-widest">The Counsel</h3>
                            <p className="text-white text-[15px] leading-relaxed font-medium">
                                {state.post.counsel}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center pt-6 border-t border-zinc-800 shrink-0">
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
                    Step 3 of 3
                </p>
                <button
                    onClick={onClose}
                    disabled={isLoading || !state.post}
                    className="px-8 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:shadow-none"
                >
                    <Check className="w-4 h-4" />
                    <span>Publish & Finish</span>
                </button>
            </div>
        </div>
    );
}
