"use client";

import React, { useState } from 'react';
import { Circle, Heart, CloudSun, Loader2, Users, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

export interface OnboardingFormData {
    defining_words: string[];
    wants: string[];
    interests: string[];
    people: { name: string; relationship: string; about: string }[];
    dream_living: string;
    dream_financial: string;
    name: string;
    gender: string;
    birthdate: string;
    ethnicity: string;
    skin_tone: string;
    hair_colors: string[];
    hair_texture: string;
    eye_color: string;
    height: string;
}

export interface OnboardingFormProps {
    onSubmit: (data: OnboardingFormData) => void;
    isSubmitting?: boolean;
    initialValues?: Partial<OnboardingFormData>;
}

const inputClass = "w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-colors text-sm";
const labelClass = "text-xs font-medium text-zinc-400 mb-1 block";
const sectionHeaderClass = "text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2";

function padArray(arr: string[] | undefined, len: number): string[] {
    const base = arr || [];
    return [...base, ...Array(Math.max(0, len - base.length)).fill('')].slice(0, len);
}

function padPeople(arr: { name: string; relationship: string; about: string }[] | undefined, len: number) {
    const base = (arr || []).map(p => ({ name: p.name || '', relationship: p.relationship || '', about: p.about || '' }));
    return [...base, ...Array(Math.max(0, len - base.length)).fill(null).map(() => ({ name: '', relationship: '', about: '' }))].slice(0, len);
}

export function OnboardingForm({ onSubmit, isSubmitting = false, initialValues }: OnboardingFormProps) {
    const t = useTranslations('onboarding.form');
    const iv = initialValues || {};
    const [definingWords, setDefiningWords] = useState<string[]>(padArray(iv.defining_words, 3));
    const [wants, setWants] = useState<string[]>(padArray(iv.wants, 3));
    const [loves, setLoves] = useState<string[]>(padArray(iv.interests, 3));
    const [people, setPeople] = useState(padPeople(iv.people, 5));
    
    const [dreamLiving, setDreamLiving] = useState(iv.dream_living || '');
    const [dreamFinancial, setDreamFinancial] = useState(iv.dream_financial || '');
    
    const [name, setName] = useState(iv.name || '');
    const [gender, setGender] = useState(iv.gender || '');
    const [birthdate, setBirthdate] = useState(iv.birthdate || '');
    const [ethnicity, setEthnicity] = useState(iv.ethnicity || '');
    const [skinTone, setSkinTone] = useState(iv.skin_tone || '');
    const [hairColors, setHairColors] = useState<string[]>(iv.hair_colors || []);
    const [hairTexture, setHairTexture] = useState(iv.hair_texture || '');
    const [eyeColor, setEyeColor] = useState(iv.eye_color || '');
    const [height, setHeight] = useState(iv.height || '');

    const updateArray = (setter: React.Dispatch<React.SetStateAction<string[]>>, index: number, value: string) => {
        setter(prev => {
            const next = [...prev];
            next[index] = value;
            return next;
        });
    };

    const updatePerson = (index: number, field: keyof typeof people[0], value: string) => {
        setPeople(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const toggleHairColor = (color: string) => {
        setHairColors(prev => 
            prev.includes(color) ? prev.filter(c => c !== color) : [...prev, color]
        );
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        const data: OnboardingFormData = {
            defining_words: definingWords.filter(w => w.trim() !== ''),
            wants: wants.filter(w => w.trim() !== ''),
            interests: loves.filter(l => l.trim() !== ''),
            people: people.filter(p => p.name.trim() !== '' || p.relationship.trim() !== '' || p.about.trim() !== ''),
            dream_living: dreamLiving,
            dream_financial: dreamFinancial,
            name,
            gender,
            birthdate,
            ethnicity,
            skin_tone: skinTone,
            hair_colors: hairColors,
            hair_texture: hairTexture,
            eye_color: eyeColor,
            height
        };

        onSubmit(data);
    };

    const HAIR_COLOR_OPTIONS = ['Black', 'Brown', 'Blonde', 'Red', 'Gray', 'White', 'Auburn'];

    return (
        <div className="w-full h-full overflow-y-auto bg-zinc-950 p-4 sm:p-6 text-zinc-100">
            <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-10 pb-20">
                
                {/* 1. Header */}
                <div className="text-center mb-8">
                    <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">{t('title')}</h1>
                    <p className="text-zinc-400 text-sm">{t('subtitle')}</p>
                </div>

                {/* 2. t('definingWords') */}
                <section>
                    <h2 className={sectionHeaderClass}>
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        {t('definingWords')}
                    </h2>
                    <div className="flex gap-3">
                        {[1, 2, 3].map((num, i) => (
                            <input
                                key={`word-${num}`}
                                type="text"
                                placeholder={t("wordPlaceholder", { num })}
                                className={cn(inputClass, "flex-1 text-center")}
                                value={definingWords[i]}
                                onChange={(e) => updateArray(setDefiningWords, i, e.target.value)}
                            />
                        ))}
                    </div>
                </section>

                {/* 3. "{t('whatIWant')}" */}
                <section>
                    <h2 className={sectionHeaderClass}>{t('whatIWant')}</h2>
                    <div className="space-y-3">
                        {[0, 1, 2].map((i) => (
                            <div key={`want-${i}`} className="relative">
                                <Circle className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder={t('wantPlaceholder')}
                                    className={cn(inputClass, "pl-9")}
                                    value={wants[i]}
                                    onChange={(e) => updateArray(setWants, i, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                </section>

                {/* 4. "{t('whatILove')}" */}
                <section>
                    <h2 className={sectionHeaderClass}>{t('whatILove')}</h2>
                    <div className="space-y-3">
                        {[0, 1, 2].map((i) => (
                            <div key={`love-${i}`} className="relative">
                                <Heart className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder={t('lovePlaceholder')}
                                    className={cn(inputClass, "pl-9")}
                                    value={loves[i]}
                                    onChange={(e) => updateArray(setLoves, i, e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                </section>

                {/* 5. "My People" */}
                <section>
                    <h2 className={sectionHeaderClass}>
                        <Users className="w-4 h-4 text-amber-500" />
                        {t('myPeople')}
                    </h2>
                    <div className="space-y-4">
                        {people.map((person, i) => (
                            <div key={`person-${i}`} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        type="text"
                                        placeholder={t("personNamePlaceholder")}
                                        className={inputClass}
                                        value={person.name}
                                        onChange={(e) => updatePerson(i, 'name', e.target.value)}
                                    />
                                    <input
                                        type="text"
                                        placeholder={t("personRelationshipPlaceholder")}
                                        className={inputClass}
                                        value={person.relationship}
                                        onChange={(e) => updatePerson(i, 'relationship', e.target.value)}
                                    />
                                </div>
                                <input
                                    type="text"
                                    placeholder={t("personAboutPlaceholder")}
                                    className={inputClass}
                                    value={person.about}
                                    onChange={(e) => updatePerson(i, 'about', e.target.value)}
                                />
                            </div>
                        ))}
                    </div>
                </section>

                {/* 6. "My Dream" */}
                <section>
                    <h2 className={sectionHeaderClass}>
                        <CloudSun className="w-4 h-4 text-amber-500" />
                        {t('myDream')}
                    </h2>
                    <div className="space-y-3">
                        <input
                            type="text"
                            placeholder={t("dreamLivingPlaceholder")}
                            className={inputClass}
                            value={dreamLiving}
                            onChange={(e) => setDreamLiving(e.target.value)}
                        />
                        <input
                            type="text"
                            placeholder={t("dreamFinancialPlaceholder")}
                            className={inputClass}
                            value={dreamFinancial}
                            onChange={(e) => setDreamFinancial(e.target.value)}
                        />
                    </div>
                </section>

                {/* 7. "{t('myLook')}" */}
                <section>
                    <h2 className={sectionHeaderClass}>{t('myLook')}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>{t("nameLabel")}</label>
                            <input type="text" className={inputClass} value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div>
                            <label className={labelClass}>{t("genderLabel")}</label>
                            <select className={cn(inputClass, "appearance-none")} value={gender} onChange={e => setGender(e.target.value)}>
                                <option value="">{t("genderSelect")}</option>
                                <option value="Male">{t("genderMale")}</option>
                                <option value="Female">{t("genderFemale")}</option>

                                <option value="Prefer not to say">{t("genderPreferNotToSay")}</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>{t("birthdateLabel")}</label>
                            <input type="date" className={inputClass} value={birthdate} onChange={e => setBirthdate(e.target.value)} />
                        </div>
                        <div>
                            <label className={labelClass}>{t("ethnicityLabel")}</label>
                            <input type="text" className={inputClass} value={ethnicity} onChange={e => setEthnicity(e.target.value)} />
                        </div>
                        <div>
                            <label className={labelClass}>{t("skinToneLabel")}</label>
                            <select className={cn(inputClass, "appearance-none")} value={skinTone} onChange={e => setSkinTone(e.target.value)}>
                                <option value="">{t("genderSelect")}</option>
                                <option value="Fair">{t("skinToneFair")}</option>
                                <option value="Light">{t("skinToneLight")}</option>
                                <option value="Medium">{t("skinToneMedium")}</option>
                                <option value="Olive">{t("skinToneOlive")}</option>
                                <option value="Tan">{t("skinToneTan")}</option>
                                <option value="Brown">{t("skinToneBrown")}</option>
                                <option value="Dark Brown">{t("skinToneDarkBrown")}</option>
                                <option value="Deep">{t("skinToneDeep")}</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>{t("hairTextureLabel")}</label>
                            <select className={cn(inputClass, "appearance-none")} value={hairTexture} onChange={e => setHairTexture(e.target.value)}>
                                <option value="">{t("genderSelect")}</option>
                                <option value="Straight">{t("hairTextureStraight")}</option>
                                <option value="Wavy">{t("hairTextureWavy")}</option>
                                <option value="Curly">{t("hairTextureCurly")}</option>
                                <option value="Coily">{t("hairTextureCoily")}</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>{t("eyeColorLabel")}</label>
                            <select className={cn(inputClass, "appearance-none")} value={eyeColor} onChange={e => setEyeColor(e.target.value)}>
                                <option value="">{t("genderSelect")}</option>
                                <option value="Brown">{t("skinToneBrown")}</option>
                                <option value="Blue">{t("eyeColorBlue")}</option>
                                <option value="Green">{t("eyeColorGreen")}</option>
                                <option value="Hazel">{t("eyeColorHazel")}</option>
                                <option value="Gray">{t("eyeColorGray")}</option>
                                <option value="Amber">{t("eyeColorAmber")}</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>{t("heightLabel")}</label>
                            <input type="text" placeholder={t("heightPlaceholder")} className={inputClass} value={height} onChange={e => setHeight(e.target.value)} />
                        </div>
                        
                        <div className="sm:col-span-2">
                            <label className={labelClass}>{t("hairColorLabel")}</label>
                            <div className="flex flex-wrap gap-3 mt-2">
                                {HAIR_COLOR_OPTIONS.map(color => (
                                    <label key={t(`hairColor${color}` as any)} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500/50"
                                            checked={hairColors.includes(color)}
                                            onChange={() => toggleHairColor(color)}
                                        />
                                        {t(`hairColor${color}` as any)}
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* 8. Submit Button */}
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center py-3 px-4 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/50 text-zinc-950 font-bold rounded-lg transition-colors mt-8"
                >
                    {isSubmitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        t('submitButton')
                    )}
                </button>
            </form>
        </div>
    );
}
