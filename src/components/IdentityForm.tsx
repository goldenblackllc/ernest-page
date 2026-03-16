'use client';

import { useState } from 'react';
import { Users, Shield, ArrowRight } from 'lucide-react';

export interface IdentityFormData {
    character_name: string;
    gender: string;
    age: string;
    ethnicity: string;
    rant: string;
    people: string;
    enjoyments: string;
}

interface IdentityFormProps {
    initialValues?: Partial<IdentityFormData>;
    onSubmit: (data: IdentityFormData) => void;
    isSubmitting?: boolean;
    submitLabel?: string;
    showHeadings?: boolean;
}

type FormStep = 'VISION' | 'LIFE';

export function IdentityForm({
    initialValues = {},
    onSubmit,
    isSubmitting = false,
    submitLabel = 'Create My Character',
    showHeadings = true,
}: IdentityFormProps) {
    const [step, setStep] = useState<FormStep>('VISION');
    const [characterName, setCharacterName] = useState(initialValues.character_name || '');
    const [gender, setGender] = useState(initialValues.gender || '');
    const [age, setAge] = useState(initialValues.age || '');
    const [ethnicity, setEthnicity] = useState(initialValues.ethnicity || '');
    const [rant, setRant] = useState(initialValues.rant || '');
    const [people, setPeople] = useState(initialValues.people || '');
    const [enjoyments, setEnjoyments] = useState(initialValues.enjoyments || '');

    const handleSubmit = () => {
        if (!rant.trim() || !gender.trim() || isSubmitting) return;
        onSubmit({ character_name: characterName, gender, age, ethnicity, rant, people, enjoyments });
    };

    // Step 1: Define Your Standard
    if (step === 'VISION') {
        return (
            <div className="flex flex-col gap-5 animate-in fade-in duration-300">
                {showHeadings && (
                    <div className="text-center mb-2">
                        <h1 className="text-3xl font-black tracking-tight mb-3">
                            Who Do You Want to Be?
                        </h1>
                        <p className="text-base text-zinc-400 max-w-sm mx-auto leading-relaxed">
                            Don&apos;t think about it too hard. Just write.
                        </p>
                    </div>
                )}

                {/* Character Name (optional) */}
                <div>
                    <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Name your character <span className="text-zinc-600">(optional — we'll create one if blank)</span></label>
                    <input
                        type="text"
                        value={characterName}
                        onChange={(e) => setCharacterName(e.target.value)}
                        placeholder="Leave blank to auto-generate"
                        maxLength={100}
                        className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                    />
                </div>

                {/* Row 1: Gender + Age */}
                <div className="flex gap-3">
                    <div className="flex-1">
                        <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">I am a</label>
                        <input
                            type="text"
                            value={gender}
                            onChange={(e) => setGender(e.target.value)}
                            placeholder="Man, Woman, etc."
                            maxLength={50}
                            className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                        />
                    </div>
                    <div className="w-24">
                        <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Born</label>
                        <input
                            type="text"
                            value={age}
                            onChange={(e) => setAge(e.target.value)}
                            placeholder="1989"
                            maxLength={4}
                            inputMode="numeric"
                            className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                        />
                    </div>
                </div>

                {/* Ethnicity (optional) */}
                <div>
                    <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Ethnicity <span className="text-zinc-600">(optional)</span></label>
                    <input
                        type="text"
                        value={ethnicity}
                        onChange={(e) => setEthnicity(e.target.value)}
                        placeholder="e.g., Black, East Asian, Hispanic, Caucasian, Mixed..."
                        maxLength={100}
                        className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                    />
                </div>

                {/* The Rant */}
                <div>
                    <label className="text-xs text-white font-semibold mb-1 block">The Rant</label>
                    <p className="text-[11px] text-zinc-500 mb-2 leading-relaxed">Describe your ideal life — the person, the lifestyle, all of it. Raw is better than polished. We&apos;ll build your character from this.</p>
                    <textarea
                        value={rant}
                        onChange={(e) => setRant(e.target.value)}
                        placeholder="I want to be the kind of man who wakes up with a plan. Financially free. A father my kids actually look up to. In the best shape of my life. Running something that matters..."
                        maxLength={5000}
                        className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30 min-h-[180px] resize-none leading-relaxed"
                        autoFocus
                    />
                </div>

                {/* Next */}
                <button
                    onClick={() => setStep('LIFE')}
                    disabled={!rant.trim() || !gender.trim()}
                    className="w-full bg-white text-black py-3.5 text-base font-bold rounded-xl hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    Next
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        );
    }

    // Step 2: The Reality Baseline
    return (
        <div className="flex flex-col gap-5 animate-in fade-in duration-300">
            {showHeadings && (
                <div className="text-center mb-2">
                    <h1 className="text-3xl font-black tracking-tight mb-3">
                        Your Reality
                    </h1>
                    <p className="text-base text-zinc-400 max-w-sm mx-auto leading-relaxed">
                        Tell us about your life so your character fits your world.
                    </p>
                </div>
            )}
            {/* Your People */}
            <div>
                <label className="text-sm text-white font-semibold mb-1 flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    Your People
                </label>
                <p className="text-xs text-zinc-500 mb-2 leading-relaxed">Who makes you feel something — good or bad? Family, friends, rivals, pets. Don&apos;t just list names — say what&apos;s real. We&apos;ll sort it out.</p>
                <textarea
                    value={people}
                    onChange={(e) => setPeople(e.target.value)}
                    placeholder="My wife — we're solid but she thinks I work too much. My son (4) — my whole world. My dog Rex. My business partner — brilliant but I don't fully trust him yet..."
                    maxLength={3000}
                    className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30 min-h-[140px] resize-none leading-relaxed"
                    autoFocus
                />
            </div>

            {/* What Lights You Up */}
            <div>
                <label className="text-sm text-white font-semibold mb-1 flex items-center gap-1.5">
                    <Shield className="w-4 h-4" />
                    What Lights You Up
                </label>
                <p className="text-xs text-zinc-500 mb-2 leading-relaxed">What excites you? The things that make you happy stay — your character should love what you love.</p>
                <textarea
                    value={enjoyments}
                    onChange={(e) => setEnjoyments(e.target.value)}
                    placeholder="Cooking for people, 90s hip-hop, horror movies, long drives with no plan, my morning coffee ritual, pickup basketball..."
                    maxLength={3000}
                    className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30 min-h-[140px] resize-none leading-relaxed"
                />
            </div>

            {/* Submit */}
            <button
                onClick={handleSubmit}
                disabled={!rant.trim() || !gender.trim() || isSubmitting}
                className="w-full bg-white text-black py-3.5 text-base font-bold rounded-xl hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {submitLabel}
                <ArrowRight className="w-4 h-4" />
            </button>

            {/* Back */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => setStep('VISION')}
                    className="text-zinc-500 text-sm hover:text-white transition-colors flex items-center gap-1 py-3 px-4"
                >
                    ← Back
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="text-zinc-500 text-sm hover:text-white transition-colors py-3 px-4"
                >
                    Skip for now
                </button>
            </div>
        </div>
    );
}
