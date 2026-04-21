'use client';

import { useState } from 'react';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

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

type FormStep = 1 | 2 | 3 | 4 | 5;

const TOTAL_STEPS = 5;

export function IdentityForm({
    initialValues = {},
    onSubmit,
    isSubmitting = false,
    submitLabel = 'Create My Character',
    showHeadings = true,
}: IdentityFormProps) {
    const t = useTranslations();
    const [step, setStep] = useState<FormStep>(1);
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

    const progressPct = ((step - 1) / TOTAL_STEPS) * 100;

    const canAdvance = () => {
        switch (step) {
            case 1: return gender.trim().length > 0;
            case 2: return true; // birthday + ethnicity are optional
            case 3: return rant.trim().length > 0;
            case 4: return true; // people is optional
            case 5: return true; // enjoyments is optional
        }
    };

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Progress bar */}
            <div className="h-0.5 w-full bg-zinc-900 shrink-0 mb-4">
                <div
                    className="h-full bg-white transition-all duration-500 ease-out"
                    style={{ width: `${progressPct}%` }}
                />
            </div>

            {/* Step counter */}
            <div className="flex items-center justify-between mb-4 shrink-0">
                <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">
                    {step} of {TOTAL_STEPS}
                </p>
                {step > 1 && (
                    <button
                        onClick={() => setStep((step - 1) as FormStep)}
                        className="text-zinc-500 hover:text-white transition-colors flex items-center gap-1 text-xs font-semibold"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        {t('common.back')}
                    </button>
                )}
            </div>

            {/* Step content — fills available space */}
            <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-200">

                {/* ── STEP 1: Name + Gender ── */}
                {step === 1 && (
                    <div className="flex flex-col gap-5 flex-1">
                        {showHeadings && (
                            <h2 className="text-2xl font-black tracking-tight">
                                {t('onboarding.identityForm.visionTitle')}
                            </h2>
                        )}

                        <div>
                            <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">
                                {t('onboarding.identityForm.nameLabel')} <span className="text-zinc-600">{t('onboarding.identityForm.nameOptional')}</span>
                            </label>
                            <input
                                type="text"
                                value={characterName}
                                onChange={(e) => setCharacterName(e.target.value)}
                                placeholder={t('onboarding.identityForm.namePlaceholder')}
                                maxLength={100}
                                className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">{t('onboarding.identityForm.genderLabel')}</label>
                            <input
                                type="text"
                                value={gender}
                                onChange={(e) => setGender(e.target.value)}
                                placeholder={t('onboarding.identityForm.genderPlaceholder')}
                                maxLength={50}
                                autoFocus
                                className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                            />
                        </div>

                        <div className="mt-auto pt-4">
                            <button
                                onClick={() => setStep(2)}
                                disabled={!canAdvance()}
                                className="w-full bg-white text-black py-3.5 text-base font-bold rounded-xl hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {t('onboarding.identityForm.next')}
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* ── STEP 2: Birthday + Ethnicity ── */}
                {step === 2 && (
                    <div className="flex flex-col gap-5 flex-1">
                        <div>
                            <label className="text-xs text-zinc-400 font-semibold mb-1.5 block">{t('onboarding.identityForm.bornLabel')}</label>
                            <p className="text-[11px] text-zinc-600 mb-2">{t('onboarding.identityForm.bornSub')}</p>
                            <input
                                type="text"
                                value={age}
                                onChange={(e) => setAge(e.target.value)}
                                placeholder={t('onboarding.identityForm.bornPlaceholder')}
                                maxLength={30}
                                autoFocus
                                className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-3 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30"
                            />
                        </div>

                        <div>
                            <label className="text-xs text-zinc-400 font-semibold mb-1 block">
                                {t('onboarding.identityForm.ethnicityLabel')} <span className="text-zinc-600">{t('onboarding.identityForm.ethnicityOptional')}</span>
                            </label>
                            <p className="text-[11px] text-zinc-600 mb-2">{t('onboarding.identityForm.ethnicitySub')}</p>
                            <textarea
                                value={ethnicity}
                                onChange={(e) => setEthnicity(e.target.value)}
                                placeholder={t('onboarding.identityForm.ethnicityPlaceholder')}
                                maxLength={300}
                                className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30 min-h-[100px] resize-none leading-relaxed"
                            />
                        </div>

                        <div className="mt-auto pt-4">
                            <button
                                onClick={() => setStep(3)}
                                disabled={!canAdvance()}
                                className="w-full bg-white text-black py-3.5 text-base font-bold rounded-xl hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {t('onboarding.identityForm.next')}
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* ── STEP 3: The Rant ── */}
                {step === 3 && (
                    <div className="flex flex-col gap-3 flex-1 min-h-0">
                        <div className="shrink-0">
                            <label className="text-xs text-white font-semibold mb-1 block">{t('onboarding.identityForm.rantLabel')}</label>
                            <p className="text-[11px] text-zinc-500 mb-2 leading-relaxed">{t('onboarding.identityForm.rantSub')}</p>
                        </div>
                        <textarea
                            value={rant}
                            onChange={(e) => setRant(e.target.value)}
                            placeholder={t('onboarding.identityForm.rantPlaceholder')}
                            maxLength={5000}
                            autoFocus
                            className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30 flex-1 min-h-0 resize-none leading-relaxed"
                        />
                        <div className="pt-2 shrink-0">
                            <button
                                onClick={() => setStep(4)}
                                disabled={!canAdvance()}
                                className="w-full bg-white text-black py-3.5 text-base font-bold rounded-xl hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {t('onboarding.identityForm.next')}
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* ── STEP 4: People ── */}
                {step === 4 && (
                    <div className="flex flex-col gap-3 flex-1 min-h-0">
                        <div className="shrink-0">
                            <label className="text-sm text-white font-semibold mb-1 block">{t('onboarding.identityForm.peopleLabel')}</label>
                            <p className="text-xs text-zinc-500 mb-2 leading-relaxed">{t('onboarding.identityForm.peopleSub')}</p>
                        </div>
                        <textarea
                            value={people}
                            onChange={(e) => setPeople(e.target.value)}
                            placeholder={t('onboarding.identityForm.peoplePlaceholder')}
                            maxLength={3000}
                            autoFocus
                            className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30 flex-1 min-h-0 resize-none leading-relaxed"
                        />
                        <div className="pt-2 shrink-0">
                            <button
                                onClick={() => setStep(5)}
                                disabled={!canAdvance()}
                                className="w-full bg-white text-black py-3.5 text-base font-bold rounded-xl hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {t('onboarding.identityForm.next')}
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* ── STEP 5: Enjoyments ── */}
                {step === 5 && (
                    <div className="flex flex-col gap-3 flex-1 min-h-0">
                        <div className="shrink-0">
                            <label className="text-sm text-white font-semibold mb-1 block">{t('onboarding.identityForm.enjoymentsLabel')}</label>
                            <p className="text-xs text-zinc-500 mb-2 leading-relaxed">{t('onboarding.identityForm.enjoymentsSub')}</p>
                        </div>
                        <textarea
                            value={enjoyments}
                            onChange={(e) => setEnjoyments(e.target.value)}
                            placeholder={t('onboarding.identityForm.enjoymentsPlaceholder')}
                            maxLength={3000}
                            autoFocus
                            className="w-full bg-zinc-900 border border-zinc-700/50 rounded-xl p-4 text-base text-white placeholder-zinc-600 focus:border-white/40 focus:ring-1 focus:ring-white/30 flex-1 min-h-0 resize-none leading-relaxed"
                        />
                        <div className="pt-2 shrink-0">
                            <button
                                onClick={handleSubmit}
                                disabled={!rant.trim() || !gender.trim() || isSubmitting}
                                className="w-full bg-white text-black py-3.5 text-base font-bold rounded-xl hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {submitLabel}
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="text-zinc-500 text-sm hover:text-white transition-colors py-2 text-center"
                        >
                            {t('onboarding.identityForm.skip')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
