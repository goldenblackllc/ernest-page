'use client';

import { useState } from 'react';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface IdentityFormData {
    character_name: string;
    gender: string;
    birthdate: string;
    ethnicity: string;
    skin_tone: string;
    hair_colors: string[];
    hair_texture: string;
    hair_volume: string;
    eye_color: string;
    height: string;
    rant: string;
    people: string;
    enjoyments: string;
}

interface IdentityFormProps {
    initialValues?: Partial<IdentityFormData>;
    onSubmit: (data: IdentityFormData) => void;
    isSubmitting?: boolean;
    submitLabel?: string;
    visibleSteps?: FormStep[];
}

export type FormStep = 1 | 2 | 3;

export const SKIN_TONE_OPTIONS = ['Fair', 'Light', 'Medium', 'Olive', 'Tan', 'Brown', 'Dark Brown', 'Deep'];
export const HAIR_COLOR_OPTIONS = ['Black', 'Dark Brown', 'Brown', 'Light Brown', 'Auburn', 'Red', 'Blonde', 'Gray', 'White'];
export const HAIR_TEXTURE_OPTIONS = ['Straight', 'Wavy', 'Curly', 'Coily'];
export const HAIR_VOLUME_OPTIONS = ['Thick', 'Full', 'Thinning', 'Receding', 'Bald/Shaved'];
export const EYE_COLOR_OPTIONS = ['Brown', 'Hazel', 'Green', 'Blue', 'Gray', 'Amber'];
export const HEIGHT_OPTIONS = [
    `4'8"`, `4'9"`, `4'10"`, `4'11"`,
    `5'0"`, `5'1"`, `5'2"`, `5'3"`, `5'4"`, `5'5"`, `5'6"`, `5'7"`, `5'8"`, `5'9"`, `5'10"`, `5'11"`,
    `6'0"`, `6'1"`, `6'2"`, `6'3"`, `6'4"`, `6'5"`, `6'6"`, `6'7"`, `6'8"`,
];

const inputClass = "w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-base text-white placeholder-zinc-500 focus:border-white/40 focus:ring-1 focus:ring-white/30";
const selectClass = "w-full bg-zinc-900 border border-zinc-700/50 rounded-xl px-3 py-2.5 text-sm text-white focus:border-white/40 focus:ring-1 focus:ring-white/30 [color-scheme:dark] appearance-none";
const labelClass = "text-xs text-zinc-400 font-semibold mb-1 block";

export function PillSelect({ label, options, value, onChange }: {
    label: string;
    options: string[];
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div>
            <label className={labelClass}>{label}</label>
            <div className="flex flex-wrap gap-2">
                {options.map(opt => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => onChange(value === opt ? '' : opt)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all
                            ${value === opt
                                ? 'bg-white text-black'
                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                    >
                        {opt}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function PillMultiSelect({ label, options, values, onChange }: {
    label: string;
    options: string[];
    values: string[];
    onChange: (v: string[]) => void;
}) {
    const toggle = (opt: string) => {
        if (values.includes(opt)) {
            onChange(values.filter(v => v !== opt));
        } else {
            onChange([...values, opt]);
        }
    };
    return (
        <div>
            <label className={labelClass}>{label}</label>
            <div className="flex flex-wrap gap-2">
                {options.map(opt => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => toggle(opt)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all
                            ${values.includes(opt)
                                ? 'bg-white text-black'
                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                    >
                        {opt}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function IdentityForm({
    initialValues = {},
    onSubmit,
    isSubmitting = false,
    submitLabel = 'Create My Character',
    visibleSteps,
}: IdentityFormProps) {
    const t = useTranslations();
    const allSteps: FormStep[] = visibleSteps || [1, 2, 3];
    const [step, setStep] = useState<FormStep>(allSteps[0]);
    const stepIndex = allSteps.indexOf(step);
    const isLastVisibleStep = stepIndex === allSteps.length - 1;
    const [characterName, setCharacterName] = useState(initialValues.character_name || '');
    const [gender, setGender] = useState(initialValues.gender || '');
    const [birthdate, setBirthdate] = useState(initialValues.birthdate || '');
    const [ethnicity, setEthnicity] = useState(initialValues.ethnicity || '');
    const [skinTone, setSkinTone] = useState(initialValues.skin_tone || '');
    const [hairColors, setHairColors] = useState<string[]>(initialValues.hair_colors || []);
    const [hairTexture, setHairTexture] = useState(initialValues.hair_texture || '');
    const [hairVolume, setHairVolume] = useState(initialValues.hair_volume || '');
    const [eyeColor, setEyeColor] = useState(initialValues.eye_color || '');
    const [height, setHeight] = useState(initialValues.height || '');
    const [rant, setRant] = useState(initialValues.rant || '');
    const [enjoyments, setEnjoyments] = useState(initialValues.enjoyments || '');

    const handleSubmit = () => {
        if (!gender.trim() || isSubmitting) return;
        // Only require rant if step 1 is visible
        if (allSteps.includes(1) && !rant.trim()) return;
        onSubmit({ character_name: characterName, gender, birthdate, ethnicity, skin_tone: skinTone, hair_colors: hairColors, hair_texture: hairTexture, hair_volume: hairVolume, eye_color: eyeColor, height, rant, people: '', enjoyments });
    };

    const progressPct = (stepIndex / allSteps.length) * 100;

    const goNext = () => setStep(allSteps[stepIndex + 1]);
    const goBack = () => setStep(allSteps[stepIndex - 1]);

    const canAdvance = () => {
        switch (step) {
            case 1: return rant.trim().length > 0;
            case 2: return gender.trim().length > 0 && birthdate.trim().length > 0;
            case 3: return true; // enjoyments is optional
        }
    };

    // Shared action button for all steps
    const ActionButton = () => (
        <div className="mt-auto pt-4 shrink-0">
            <button
                onClick={isLastVisibleStep ? handleSubmit : goNext}
                disabled={!canAdvance() || (isLastVisibleStep && isSubmitting)}
                className="w-full bg-white text-black py-3.5 text-base font-bold rounded-xl hover:bg-zinc-200 active:scale-[0.98] transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {isLastVisibleStep ? submitLabel : t('onboarding.identityForm.next')}
                <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );

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
                <p className="text-sm text-zinc-400 uppercase tracking-widest font-semibold">
                    {stepIndex + 1} of {allSteps.length}
                </p>
                {stepIndex > 0 && (
                    <button
                        onClick={goBack}
                        className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1 text-sm font-semibold"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        {t('common.back')}
                    </button>
                )}
            </div>

            {/* Step content — fills available space */}
            <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-200">

                {/* ── STEP 1: The Rant ── */}
                {step === 1 && (
                    <div className="flex flex-col gap-3 flex-1 min-h-0">
                        <div className="shrink-0">
                            <label className="text-lg text-white font-bold mb-1 block">{t('onboarding.identityForm.rantLabel')}</label>
                            <p className="text-sm text-zinc-400">{t('onboarding.identityForm.rantSub')}</p>
                        </div>
                        <textarea
                            value={rant}
                            onChange={(e) => setRant(e.target.value)}
                            placeholder={t('onboarding.identityForm.rantPlaceholder')}
                            maxLength={5000}
                            autoFocus
                            className={`${inputClass} flex-1 min-h-0 resize-none leading-relaxed`}
                        />
                        <ActionButton />
                    </div>
                )}

                {/* ── STEP 2: About You — Name, Gender, Physical Traits ── */}
                {step === 2 && (
                    <div className="flex flex-col gap-2 flex-1 overflow-y-auto min-h-0">
                        <label className="text-lg text-white font-bold">{t('onboarding.identityForm.aboutYouLabel')}</label>

                        {/* Text fields — no labels, placeholder-only */}
                        <input
                            type="text"
                            value={characterName}
                            onChange={(e) => setCharacterName(e.target.value)}
                            placeholder={t('onboarding.identityForm.nameLabel')}
                            maxLength={100}
                            autoFocus
                            className={inputClass}
                        />
                        <input
                            type="text"
                            value={gender}
                            onChange={(e) => setGender(e.target.value)}
                            placeholder={t('onboarding.identityForm.genderPlaceholder')}
                            maxLength={50}
                            className={inputClass}
                        />
                        <div>
                            <label className={labelClass}>{t('onboarding.identityForm.bornLabel')}</label>
                            <input
                                type="date"
                                value={birthdate}
                                onChange={(e) => setBirthdate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                                min="1920-01-01"
                                className={`${inputClass} [color-scheme:dark]`}
                            />
                        </div>
                        <input
                            type="text"
                            value={ethnicity}
                            onChange={(e) => setEthnicity(e.target.value)}
                            placeholder={t('onboarding.identityForm.ethnicityLabel')}
                            maxLength={100}
                            className={inputClass}
                        />

                        {/* Row 1: Skin Tone + Eye Color + Height */}
                        <div className="grid grid-cols-3 gap-2 mt-1">
                            <div>
                                <label className={labelClass}>{t('onboarding.identityForm.skinToneLabel')}</label>
                                <select value={skinTone} onChange={(e) => setSkinTone(e.target.value)} className={selectClass}>
                                    <option value="">—</option>
                                    {SKIN_TONE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>{t('onboarding.identityForm.eyeColorLabel')}</label>
                                <select value={eyeColor} onChange={(e) => setEyeColor(e.target.value)} className={selectClass}>
                                    <option value="">—</option>
                                    {EYE_COLOR_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>{t('onboarding.identityForm.heightLabel')}</label>
                                <select value={height} onChange={(e) => setHeight(e.target.value)} className={selectClass}>
                                    <option value="">—</option>
                                    {HEIGHT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Row 2: Hair Color + Texture + Volume */}
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <label className={labelClass}>{t('onboarding.identityForm.hairColorLabel')}</label>
                                <select
                                    value={hairColors[0] || ''}
                                    onChange={(e) => setHairColors(e.target.value ? [e.target.value] : [])}
                                    className={selectClass}
                                >
                                    <option value="">—</option>
                                    {HAIR_COLOR_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>{t('onboarding.identityForm.hairTextureLabel')}</label>
                                <select value={hairTexture} onChange={(e) => setHairTexture(e.target.value)} className={selectClass}>
                                    <option value="">—</option>
                                    {HAIR_TEXTURE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>{t('onboarding.identityForm.hairVolumeLabel')}</label>
                                <select value={hairVolume} onChange={(e) => setHairVolume(e.target.value)} className={selectClass}>
                                    <option value="">—</option>
                                    {HAIR_VOLUME_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                        </div>

                        <ActionButton />
                    </div>
                )}

                {/* ── STEP 3: Enjoyments ── */}
                {step === 3 && (
                    <div className="flex flex-col gap-3 flex-1 min-h-0">
                        <div className="shrink-0">
                            <label className="text-lg text-white font-bold mb-1 block">{t('onboarding.identityForm.enjoymentsLabel')}</label>
                        </div>
                        <textarea
                            value={enjoyments}
                            onChange={(e) => setEnjoyments(e.target.value)}
                            placeholder={t('onboarding.identityForm.enjoymentsPlaceholder')}
                            maxLength={3000}
                            autoFocus
                            className={`${inputClass} flex-1 min-h-0 resize-none leading-relaxed`}
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
                            className="text-zinc-400 text-sm hover:text-white transition-colors py-2 text-center"
                        >
                            {t('onboarding.identityForm.skip')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
