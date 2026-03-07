'use client';

import { useState } from 'react';
import { Users, Heart, ArrowRight } from 'lucide-react';

export interface IdentityFormData {
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
    const [gender, setGender] = useState(initialValues.gender || '');
    const [age, setAge] = useState(initialValues.age || '');
    const [ethnicity, setEthnicity] = useState(initialValues.ethnicity || '');
    const [rant, setRant] = useState(initialValues.rant || '');
    const [people, setPeople] = useState(initialValues.people || '');
    const [enjoyments, setEnjoyments] = useState(initialValues.enjoyments || '');

    const handleSubmit = () => {
        if (!rant.trim() || !gender.trim() || isSubmitting) return;
        onSubmit({ gender, age, ethnicity, rant, people, enjoyments });
    };

    // Step 1: Who Do You Want to Be?
    if (step === 'VISION') {
        return (
            <div className="flex flex-col gap-5 animate-in fade-in duration-300">
                {showHeadings && (
                    <div className="text-center mb-2">
                        <h1 className="text-3xl font-black tracking-tight mb-3">
                            Who Do You Want to Be?
                        </h1>
                        <p className="text-base text-zinc-400 max-w-sm mx-auto leading-relaxed">
                            If you had a genie in a lamp, what life would you wish you had?
                        </p>
                    </div>
                )}
                {/* Row 1: Gender + Age */}
                <div className="flex gap-3">
                    <div className="flex-1">
                        <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">I am a</label>
                        <input
                            type="text"
                            value={gender}
                            onChange={(e) => setGender(e.target.value)}
                            placeholder="Man, Woman, etc."
                            className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                        />
                    </div>
                    <div className="w-24">
                        <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">Age</label>
                        <input
                            type="text"
                            value={age}
                            onChange={(e) => setAge(e.target.value)}
                            placeholder="35"
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
                        className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                    />
                </div>

                {/* The Vision */}
                <div>
                    <label className="text-xs text-white font-semibold mb-1 block">The Vision</label>
                    <p className="text-[11px] text-zinc-500 mb-2 leading-relaxed">Describe the life you would wish for. Don&apos;t worry about formatting — just get your thoughts down. We&apos;ll translate this into your ideal character.</p>
                    <textarea
                        value={rant}
                        onChange={(e) => setRant(e.target.value)}
                        placeholder="I want to be the kind of person who..."
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

    // Step 2: Your Life
    return (
        <div className="flex flex-col gap-5 animate-in fade-in duration-300">
            {showHeadings && (
                <div className="text-center mb-2">
                    <h1 className="text-3xl font-black tracking-tight mb-3">
                        Your Life
                    </h1>
                    <p className="text-base text-zinc-400 max-w-sm mx-auto leading-relaxed">
                        Who&apos;s in your world? What brings you joy?
                    </p>
                </div>
            )}
            {/* The People (and animals) In Your Life */}
            <div>
                <label className="text-sm text-white font-semibold mb-1 flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    The People (and animals) In Your Life
                </label>
                <p className="text-xs text-zinc-500 mb-2 leading-relaxed">Who matters in your world? Partners, kids, friends, coworkers, pets — tell us about them.</p>
                <textarea
                    value={people}
                    onChange={(e) => setPeople(e.target.value)}
                    placeholder="e.g., My partner (age), my kids, my best friend, my dog..."
                    className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30 min-h-[140px] resize-none leading-relaxed"
                    autoFocus
                />
            </div>

            {/* What You Love */}
            <div>
                <label className="text-sm text-white font-semibold mb-1 flex items-center gap-1.5">
                    <Heart className="w-4 h-4" />
                    What You Love
                </label>
                <p className="text-xs text-zinc-500 mb-2 leading-relaxed">What brings you joy? Favorite foods, media, hobbies, or unchanging preferences. Your ideal self is still you.</p>
                <textarea
                    value={enjoyments}
                    onChange={(e) => setEnjoyments(e.target.value)}
                    placeholder="e.g., Coffee, hiking, sci-fi movies, cooking for friends..."
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
