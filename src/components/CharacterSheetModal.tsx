"use client";

import React, { useState, useEffect } from "react";
import { CharacterBible } from "@/types/character";
import { updateCharacterBible } from "@/lib/firebase/character";
import { X, Save, Plus, Trash2, Camera, Calendar, User, Heart, Brain, Zap, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthContext";

type Tab = 'IDENTITY' | 'CODE' | 'LIFESTYLE' | 'CONTEXT';

interface CharacterSheetModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData: CharacterBible;
}

export function CharacterSheetModal({ isOpen, onClose, initialData }: CharacterSheetModalProps) {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>('IDENTITY');
    const [formData, setFormData] = useState<CharacterBible>(initialData);
    const [isSaving, setIsSaving] = useState(false);

    // Reset form when modal opens with new data
    useEffect(() => {
        setFormData(initialData);
    }, [initialData, isOpen]);

    const handleSave = async () => {
        if (!user) return;
        setIsSaving(true);
        try {
            await updateCharacterBible(user.uid, formData);
            onClose();
        } catch (error) {
            console.error("Failed to save:", error);
            alert("Failed to save character sheet.");
        } finally {
            setIsSaving(false);
        }
    };

    const updateField = (field: keyof CharacterBible, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const updateNestedField = (parent: keyof CharacterBible, key: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            [parent]: {
                // @ts-ignore
                ...prev[parent],
                [key]: value
            }
        }));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />

            {/* Modal Container */}
            <div className="relative w-full max-w-4xl h-[90vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="shrink-0 h-16 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50">
                    <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400">Character Sheet</h2>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            {isSaving ? "Saving..." : "Save Changes"}
                        </button>
                        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="shrink-0 border-b border-zinc-800 flex overflow-x-auto no-scrollbar">
                    <TabButton active={activeTab === 'IDENTITY'} onClick={() => setActiveTab('IDENTITY')} icon={User} label="Identity" />
                    <TabButton active={activeTab === 'CODE'} onClick={() => setActiveTab('CODE')} icon={Brain} label="Code" />
                    <TabButton active={activeTab === 'LIFESTYLE'} onClick={() => setActiveTab('LIFESTYLE')} icon={Zap} label="Lifestyle" />
                    <TabButton active={activeTab === 'CONTEXT'} onClick={() => setActiveTab('CONTEXT')} icon={Hash} label="Context" />
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar">

                    {/* --- TAB 1: IDENTITY --- */}
                    {activeTab === 'IDENTITY' && (
                        <div className="space-y-8 max-w-2xl mx-auto">
                            <InputGroup label="Archetype Title">
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={e => updateField('title', e.target.value)}
                                    className="w-full bg-transparent border-b border-zinc-700 pb-2 text-2xl font-black uppercase tracking-tight text-white focus:border-emerald-500 focus:outline-none placeholder-zinc-700"
                                    placeholder="E.g. THE ARCHITECT"
                                />
                            </InputGroup>

                            <InputGroup label="Manifesto / Summary">
                                <textarea
                                    value={formData.summary}
                                    onChange={e => updateField('summary', e.target.value)}
                                    className="w-full bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 text-zinc-300 font-serif leading-relaxed focus:border-emerald-500 focus:outline-none min-h-[150px] resize-none"
                                    placeholder="I am..."
                                />
                            </InputGroup>

                            <InputGroup label="Role Models">
                                <ObjectArrayInput
                                    items={formData.role_models}
                                    onChange={val => updateField('role_models', val)}
                                    fields={[
                                        { key: 'name', placeholder: 'Name (e.g. Steve Jobs)', width: '40%' },
                                        { key: 'reason', placeholder: 'Why? (e.g. Visionary)', width: '60%' }
                                    ]}
                                />
                            </InputGroup>

                            {/* Visual Board Hint */}
                            <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl flex items-center gap-4">
                                <div className="p-3 bg-zinc-800 rounded-full">
                                    <Camera className="w-5 h-5 text-zinc-400" />
                                </div>
                                <div className="text-xs text-zinc-500">
                                    <strong className="text-zinc-300 block mb-1">VISUAL BOARD</strong>
                                    Upload feature coming soon. For now, URLs are managed via direct DB entry.
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- TAB 2: CODE (Psychographics) --- */}
                    {activeTab === 'CODE' && (
                        <div className="space-y-10 max-w-2xl mx-auto">
                            <InputGroup label="Core Beliefs (The OS)">
                                <TagInput
                                    tags={formData.core_beliefs}
                                    onChange={val => updateField('core_beliefs', val)}
                                    placeholder="Type a belief and hit Enter..."
                                />
                            </InputGroup>

                            <InputGroup label="Operating Rules">
                                <ObjectArrayInput
                                    items={formData.rules}
                                    onChange={val => updateField('rules', val)}
                                    fields={[
                                        { key: 'rule', placeholder: 'Rule (e.g. Never skip twice)', width: '40%' },
                                        { key: 'description', placeholder: 'Description...', width: '60%' }
                                    ]}
                                    generateId
                                />
                            </InputGroup>

                            <InputGroup label="Mantras / Mental Models">
                                <TagInput
                                    tags={formData.thoughts}
                                    onChange={val => updateField('thoughts', val)}
                                    placeholder="Add a mantra..."
                                />
                            </InputGroup>
                        </div>
                    )}

                    {/* --- TAB 3: LIFESTYLE --- */}
                    {activeTab === 'LIFESTYLE' && (
                        <div className="space-y-10 max-w-2xl mx-auto">
                            <InputGroup label="Daily Habits">
                                <TagInput
                                    tags={formData.habits}
                                    onChange={val => updateField('habits', val)}
                                    placeholder="Add a habit..."
                                />
                            </InputGroup>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <InputGroup label="Diet / Food">
                                    <TagInput
                                        tags={formData.consumption.food}
                                        onChange={val => updateNestedField('consumption', 'food', val)}
                                        placeholder="Add dietary rule..."
                                    />
                                </InputGroup>
                                <InputGroup label="Media Diet">
                                    <TagInput
                                        tags={formData.consumption.media}
                                        onChange={val => updateNestedField('consumption', 'media', val)}
                                        placeholder="Add media rule..."
                                    />
                                </InputGroup>
                            </div>

                            <InputGroup label="Positive Events (Joy)">
                                <TagInput
                                    tags={formData.positive_events}
                                    onChange={val => updateField('positive_events', val)}
                                    placeholder="What makes you happy?"
                                />
                            </InputGroup>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <InputGroup label="Wants">
                                    <TagInput
                                        tags={formData.wants}
                                        onChange={val => updateField('wants', val)}
                                        placeholder="Add a want..."
                                    />
                                </InputGroup>
                                <InputGroup label="Goals">
                                    <TagInput
                                        tags={formData.goals}
                                        onChange={val => updateField('goals', val)}
                                        placeholder="Add a goal..."
                                    />
                                </InputGroup>
                            </div>
                        </div>
                    )}

                    {/* --- TAB 4: CONTEXT --- */}
                    {activeTab === 'CONTEXT' && (
                        <div className="space-y-8 max-w-2xl mx-auto">
                            <InputGroup label="Relationships">
                                <ObjectArrayInput
                                    items={formData.relationships}
                                    onChange={val => updateField('relationships', val)}
                                    fields={[
                                        { key: 'name', placeholder: 'Name', width: '30%' },
                                        { key: 'relation', placeholder: 'Relation', width: '30%' },
                                        { key: 'notes', placeholder: 'Notes', width: '40%' }
                                    ]}
                                />
                            </InputGroup>

                            <InputGroup label="Living Situation">
                                <input
                                    type="text"
                                    value={formData.living_situation || ""}
                                    onChange={e => updateField('living_situation', e.target.value)}
                                    className="w-full bg-transparent border-b border-zinc-700 pb-2 text-zinc-300 focus:border-emerald-500 focus:outline-none"
                                    placeholder="E.g. Apartment in NYC, alone."
                                />
                            </InputGroup>

                            <InputGroup label="Favorite Music">
                                <TagInput
                                    tags={formData.music}
                                    onChange={val => updateField('music', val)}
                                    placeholder="Add artist/genre..."
                                />
                            </InputGroup>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- SUB COMPONENTS ---

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "h-12 px-6 flex items-center gap-2 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors shrink-0",
                active ? "border-emerald-500 text-white" : "border-transparent text-zinc-600 hover:text-zinc-400"
            )}
        >
            <Icon className="w-4 h-4" />
            {label}
        </button>
    );
}

function InputGroup({ label, children }: { label: string, children: React.ReactNode }) {
    return (
        <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</label>
            {children}
        </div>
    );
}

function TagInput({ tags, onChange, placeholder }: { tags: string[], onChange: (val: string[]) => void, placeholder: string }) {
    const [input, setInput] = useState("");

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && input.trim()) {
            e.preventDefault();
            onChange([...tags, input.trim()]);
            setInput("");
        }
    };

    const removeTag = (index: number) => {
        onChange(tags.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-3">
            <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="w-full bg-transparent border-b border-zinc-700 pb-2 text-zinc-300 focus:border-emerald-500 focus:outline-none"
            />
            <div className="flex flex-wrap gap-2">
                {tags.map((tag, i) => (
                    <div key={i} className="bg-zinc-900 border border-zinc-800 text-zinc-300 px-3 py-1.5 rounded-md text-sm flex items-center gap-2">
                        <span>{tag}</span>
                        <button onClick={() => removeTag(i)} className="text-zinc-600 hover:text-red-400">
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ObjectArrayInput({ items, onChange, fields, generateId }: { items: any[], onChange: (val: any[]) => void, fields: { key: string, placeholder: string, width: string }[], generateId?: boolean }) {
    const [newItem, setNewItem] = useState<any>({});

    const handleAdd = () => {
        // Validation: Ensure at least the first field is filled
        if (!newItem[fields[0].key]) return;

        const itemToAdd = { ...newItem };
        if (generateId) itemToAdd.id = crypto.randomUUID();

        onChange([...items, itemToAdd]);
        setNewItem({});
    };

    const handleRemove = (index: number) => {
        onChange(items.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-3">
            {/* List Existing */}
            <div className="space-y-2">
                {items.map((item, i) => (
                    <div key={i} className="flex gap-2 items-start group">
                        <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 flex gap-4">
                            {fields.map(f => (
                                <div key={f.key} style={{ width: f.width }} className="truncate text-sm text-zinc-300">
                                    <span className="text-zinc-600 text-[10px] uppercase mr-2">{f.key}:</span>
                                    {item[f.key]}
                                </div>
                            ))}
                        </div>
                        <button onClick={() => handleRemove(i)} className="p-3 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Add New */}
            <div className="flex gap-2 items-end">
                {fields.map(f => (
                    <div key={f.key} style={{ width: f.width }}>
                        <input
                            value={newItem[f.key] || ""}
                            onChange={e => setNewItem({ ...newItem, [f.key]: e.target.value })}
                            placeholder={f.placeholder}
                            className="w-full bg-transparent border-b border-zinc-700 pb-1 text-sm text-zinc-300 focus:border-emerald-500 focus:outline-none"
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                    </div>
                ))}
                <button
                    onClick={handleAdd}
                    disabled={!newItem[fields[0].key]}
                    className="p-1 text-emerald-500 hover:text-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    <Plus className="w-5 h-5" />
                </button>
            </div>
        </div>
    )
}
