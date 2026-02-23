import React, { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { CheckInState } from './CheckInWizardModal';

interface InputStepProps {
    state: CheckInState;
    setState: React.Dispatch<React.SetStateAction<CheckInState>>;
    onNext: () => void;
    onCancel: () => void;
}

export default function InputStep({ state, setState, onNext, onCancel }: InputStepProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (!state.rant.trim()) {
            setError('Please describe what is going on before we consult.');
            return;
        }

        setIsGenerating(true);
        setError('');

        try {
            // Get the current user token via the backend directly instead of passing it from frontend props to keep it clean.
            // But we actually DO pass uid from context if we need it. For now, since CheckInWizardModal doesn't pass UID, 
            // the CounselStep actually fetches the user profile using the auth context *inside* the API route or passed.
            // Let's look at how BriefingStep used to call Consult. It didn't. BriefingStep just advanced to CounselStep, and CounselStep did the loading.

            // Wait, CounselStep is where the API call happens. We just need to advance the step here.
            onNext();
        } catch (err: any) {
            console.error('Submission failed:', err);
            setError('Failed to advance. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
            <div className="flex-1 overflow-y-auto mb-6">
                <div className="space-y-6">
                    <div className="space-y-2">
                        <h3 className="text-xl font-bold text-white tracking-tight">What's going on since the last check in?</h3>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            Write freely. What are you facing? What is your tension? This is strictly private between you and Character A.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <textarea
                            value={state.rant}
                            onChange={(e) => {
                                setState(prev => ({ ...prev, rant: e.target.value }));
                                if (error) setError('');
                            }}
                            placeholder="I'm feeling..."
                            className="w-full h-64 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-y transition-shadow custom-scrollbar"
                        />
                        {error && (
                            <p className="text-sm text-red-500 font-medium animate-in fade-in duration-200">
                                {error}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex gap-3 mt-auto shrink-0 border-t border-zinc-800/50 pt-6">
                <button
                    onClick={onCancel}
                    className="flex-1 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl font-bold transition-all border border-zinc-800"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!state.rant.trim() || isGenerating}
                    className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 transition-all font-sans"
                >
                    {isGenerating ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        <>
                            Consult <ArrowRight className="w-4 h-4" />
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
