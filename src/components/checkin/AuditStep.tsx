import React, { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { CheckInState } from './CheckInWizardModal';
import { useAuth } from '@/lib/auth/AuthContext';
import { subscribeToCharacterProfile, updateCharacterProfile } from '@/lib/firebase/character';
import { CharacterProfile } from '@/types/character';
import { cn } from '@/lib/utils';

interface AuditStepProps {
    state: CheckInState;
    setState: React.Dispatch<React.SetStateAction<CheckInState>>;
    onNext: () => void;
    onCancel: () => void;
}

export default function AuditStep({ state, setState, onNext, onCancel }: AuditStepProps) {
    const { user } = useAuth();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);

    useEffect(() => {
        if (!user) return;
        const unsubscribe = subscribeToCharacterProfile(user.uid, (data) => {
            setProfile(data);
        });
        return () => unsubscribe();
    }, [user]);

    const handleToggleTodo = async (todoId: string, currentCompleted: boolean) => {
        if (!user || !profile?.active_todos) return;

        const updatedTodos = profile.active_todos.map(todo =>
            todo.id === todoId ? { ...todo, completed: !currentCompleted } : todo
        );

        await updateCharacterProfile(user.uid, {
            active_todos: updatedTodos
        });
    };

    const isReady = state.gap.trim().length > 0;

    return (
        <div className="flex flex-col h-full animate-in slide-in-from-right-8 duration-300">
            <div className="mb-8 space-y-1">
                <h2 className="text-2xl font-bold tracking-tight text-white">The Audit</h2>
                <p className="text-sm font-medium text-zinc-500">Review your recent actions against your Ideal Character.</p>
            </div>

            <div className="flex-1 space-y-8 flex flex-col">
                {/* 1. Alignment Score */}
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <label className="text-sm font-bold text-zinc-300">Alignment Score</label>
                        <span className="text-2xl font-black text-emerald-500">{state.alignmentScore}%</span>
                    </div>
                    <p className="text-sm text-zinc-500 pb-2">How much of your Ideal Character did you embody since last time?</p>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={state.alignmentScore}
                        onChange={(e) => setState(prev => ({ ...prev, alignmentScore: parseInt(e.target.value) }))}
                        className="w-full accent-emerald-500 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                        <span>Fell Short</span>
                        <span>Locked In</span>
                    </div>
                </div>

                {/* 2. The Gap */}
                <div className="space-y-3">
                    <label className="text-sm font-bold text-zinc-300">The Gap</label>
                    <p className="text-sm text-zinc-500">What pulled you out of character? (What was the friction?)</p>
                    <textarea
                        value={state.gap}
                        onChange={(e) => setState(prev => ({ ...prev, gap: e.target.value }))}
                        placeholder="e.g. I got distracted by social media, I was reactive to my boss..."
                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 text-zinc-300 text-sm leading-relaxed focus:border-zinc-500 focus:outline-none min-h-[100px] resize-none"
                    />
                </div>

                {/* 3. Directive Review */}
                {profile?.active_todos && profile.active_todos.length > 0 && (
                    <div className="space-y-4">
                        <label className="text-sm font-bold text-zinc-300 block border-b border-zinc-800 pb-2">Directive Review</label>
                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                            {profile.active_todos.map(todo => (
                                <div
                                    key={todo.id}
                                    onClick={() => handleToggleTodo(todo.id, todo.completed)}
                                    className="flex items-start gap-3 bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 cursor-pointer transition-colors hover:border-zinc-600 group"
                                >
                                    <button className="mt-0.5 shrink-0 text-zinc-500 group-hover:text-emerald-400 transition-colors">
                                        {todo.completed ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5" />}
                                    </button>
                                    <p className={cn(
                                        "text-sm leading-relaxed select-none transition-all",
                                        todo.completed ? "text-zinc-600 line-through" : "text-zinc-300"
                                    )}>
                                        {todo.task}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center pt-6 mt-8 border-t border-zinc-800 shrink-0">
                <button onClick={onCancel} className="text-zinc-500 hover:text-white text-sm font-medium px-4 py-2 transition-colors">
                    Cancel
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
                    <span>Next</span>
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
