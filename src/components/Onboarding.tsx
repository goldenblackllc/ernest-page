'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { Sparkles, Loader2, ArrowRight, RotateCcw, Users, Heart } from 'lucide-react';

type OnboardingStep = 'RANT' | 'FOUNDATION' | 'PROCESSING' | 'REVEAL';

interface OnboardingProps {
    onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
    const { user } = useAuth();
    const [step, setStep] = useState<OnboardingStep>('RANT');
    const [gender, setGender] = useState('');
    const [age, setAge] = useState('');
    const [rant, setRant] = useState('');

    // Foundation fields
    const [people, setPeople] = useState('');
    const [enjoyments, setEnjoyments] = useState('');

    const [result, setResult] = useState<{
        title: string;
        dream_self: string;
        dossier: string;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleProcess = async () => {
        if (!rant.trim() || !gender.trim() || !user) return;

        setStep('PROCESSING');
        setError(null);

        try {
            const res = await fetch('/api/onboarding/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: user.uid,
                    rant: rant.trim(),
                    gender: gender.trim(),
                    age: age.trim(),
                    important_people: people.trim(),
                    things_i_enjoy: enjoyments.trim(),
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || data.error || 'Processing failed.');
            }

            setResult({
                title: data.title,
                dream_self: data.dream_self,
                dossier: data.dossier,
            });
            setStep('REVEAL');
        } catch (err: any) {
            console.error('Onboarding error:', err);
            setError(err.message || 'Something went wrong. Please try again.');
            setStep('FOUNDATION');
        }
    };

    const handleRegenerate = () => {
        setResult(null);
        setStep('RANT');
    };

    const handleAcceptAndCompile = async () => {
        if (!user || !result) return;

        setStep('PROCESSING');
        try {
            const res = await fetch('/api/character/compile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uid: user.uid,
                    source_code: {
                        archetype: result.title,
                        manifesto: result.dream_self,
                        core_beliefs: '',
                        important_people: people.trim(),
                        things_i_enjoy: enjoyments.trim(),
                    },
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || data.error || 'Compilation failed.');
            }

            onComplete();
        } catch (err: any) {
            console.error('Compile error:', err);
            setError(err.message || 'Failed to generate your character. Please try again.');
            setStep('REVEAL');
        }
    };

    return (
        <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 py-12">
            <div className="w-full max-w-lg mx-auto">

                {/* Step 1: The Dream Rant (FIRST) */}
                {step === 'RANT' && (
                    <div className="flex flex-col gap-5 animate-in fade-in duration-300">
                        <div className="text-center mb-2">
                            <h1 className="text-3xl font-black tracking-tight mb-3">
                                Who Do You Want to Be?
                            </h1>
                            <p className="text-base text-zinc-400 max-w-sm mx-auto leading-relaxed">
                                If you had a genie in a lamp — who would you wish to wake up as?
                                Not what you'd want to <em className="text-zinc-300">have</em>. Who would you want to <em className="text-zinc-300">be</em>?
                            </p>
                        </div>

                        {error && (
                            <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">I am a</label>
                                <input
                                    type="text"
                                    value={gender}
                                    onChange={(e) => setGender(e.target.value)}
                                    placeholder="Man, Woman, etc."
                                    className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50"
                                />
                            </div>
                            <div className="w-24">
                                <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Age</label>
                                <input
                                    type="text"
                                    value={age}
                                    onChange={(e) => setAge(e.target.value)}
                                    placeholder="35"
                                    className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50"
                                />
                            </div>
                        </div>

                        <textarea
                            value={rant}
                            onChange={(e) => setRant(e.target.value)}
                            placeholder="I want to be the kind of person who..."
                            className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 text-[15px] text-white placeholder-zinc-600 focus:border-emerald-500/50 min-h-[200px] resize-none leading-relaxed"
                            autoFocus
                        />

                        <button
                            onClick={() => setStep('FOUNDATION')}
                            disabled={!rant.trim() || !gender.trim()}
                            className="w-full bg-white text-black py-3.5 text-sm font-bold hover:bg-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            Next
                            <ArrowRight className="w-4 h-4" />
                        </button>

                        <button
                            onClick={() => signOut(auth)}
                            className="text-zinc-500 text-sm text-center hover:text-zinc-300 transition-colors mt-1 py-3"
                        >
                            Sign out
                        </button>
                    </div>
                )}

                {/* Step 2: Foundation — People & Enjoyments */}
                {step === 'FOUNDATION' && (
                    <div className="flex flex-col gap-5 animate-in fade-in duration-300">
                        <div className="text-center mb-2">
                            <h1 className="text-3xl font-black tracking-tight mb-3">
                                Build Your World
                            </h1>
                            <p className="text-base text-zinc-400 max-w-sm mx-auto leading-relaxed">
                                Who's in your life? What lights you up?
                                The more detail, the better. You can always update later.
                            </p>
                        </div>

                        {error && (
                            <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="text-xs text-zinc-400 font-semibold mb-1.5 flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5" />
                                People in your life
                            </label>
                            <textarea
                                value={people}
                                onChange={(e) => setPeople(e.target.value)}
                                placeholder="My wife Sarah, my son Marcus who's 7, my best friend Dave from college, my boss who drives me insane..."
                                className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 min-h-[120px] resize-none leading-relaxed"
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="text-xs text-zinc-400 font-semibold mb-1.5 flex items-center gap-1.5">
                                <Heart className="w-3.5 h-3.5" />
                                What does the dream you enjoy?
                            </label>
                            <textarea
                                value={enjoyments}
                                onChange={(e) => setEnjoyments(e.target.value)}
                                placeholder="Cooking Italian food from scratch, running at 5am, old jazz records, building things with my hands..."
                                className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 text-sm text-white placeholder-zinc-600 focus:border-emerald-500/50 min-h-[120px] resize-none leading-relaxed"
                            />
                        </div>

                        <button
                            onClick={handleProcess}
                            disabled={!rant.trim() || !gender.trim()}
                            className="w-full bg-white text-black py-3.5 text-sm font-bold hover:bg-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            Show Me Who I Am
                            <Sparkles className="w-4 h-4" />
                        </button>

                        <div className="flex items-center justify-between">
                            <button
                                onClick={() => setStep('RANT')}
                                className="text-zinc-500 text-sm hover:text-white transition-colors flex items-center gap-1 py-3 px-4"
                            >
                                ← Back
                            </button>
                            <button
                                onClick={handleProcess}
                                className="text-zinc-500 text-sm hover:text-white transition-colors py-3 px-4"
                            >
                                Skip for now
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Processing */}
                {step === 'PROCESSING' && (
                    <div className="flex flex-col items-center gap-6 animate-in fade-in duration-300">
                        <Sparkles className="w-10 h-10 text-emerald-500 animate-pulse" />
                        <div className="text-center">
                            <h2 className="text-lg font-bold mb-2">Reading you...</h2>
                            <p className="text-base text-zinc-400">
                                Discovering who you are.
                            </p>
                        </div>
                        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                    </div>
                )}

                {/* Step 4: Reveal */}
                {step === 'REVEAL' && result && (
                    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
                        {/* Title */}
                        <div className="text-center">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-2">
                                Your Title
                            </p>
                            <h1 className="text-3xl font-black tracking-tight text-white">
                                {result.title}
                            </h1>
                        </div>

                        {/* Dream Self */}
                        <div className="bg-zinc-900/60 border border-white/10 rounded-xl p-5">
                            <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold mb-3">
                                Who You Are
                            </p>
                            <p className="text-base text-zinc-300 leading-relaxed whitespace-pre-line">
                                {result.dream_self}
                            </p>
                        </div>

                        {error && (
                            <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                                {error}
                            </div>
                        )}

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleAcceptAndCompile}
                                className="w-full bg-white text-black py-3.5 text-sm font-bold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
                            >
                                <Sparkles className="w-4 h-4" />
                                This Is Me — Generate My Character
                            </button>
                            <button
                                onClick={handleRegenerate}
                                className="w-full border border-zinc-800 py-3 text-sm text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors flex items-center justify-center gap-2"
                            >
                                <RotateCcw className="w-3 h-3" />
                                Edit My Rant
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
