"use client";

import React, { useState, useEffect } from "react";
import { CharacterBible } from "@/types/character";
import { updateCharacterBible } from "@/lib/firebase/character";
import { X, Save, Plus, Trash2, Camera, Calendar, User, Heart, Brain, Zap, Hash, Pencil, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/AuthContext";
import { Loader2 } from "lucide-react";

type Tab = 'IDENTITY' | 'VALUES' | 'LIFESTYLE' | 'CONTEXT';

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
            <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />

            {/* Modal Container */}
            <div className="relative w-full max-w-4xl h-[90vh] bg-zinc-950 border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="shrink-0 h-16 border-b border-white/5 flex items-center justify-between px-6 bg-zinc-900/50">
                    <h2 className="text-sm font-bold text-zinc-200">Character Sheet</h2>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-white text-black hover:bg-zinc-200 text-sm font-bold px-5 py-2 rounded-full flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            {isSaving ? "Saving..." : "Save"}
                        </button>
                        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors bg-zinc-900/50 rounded-full p-2">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="shrink-0 border-b border-white/5 flex overflow-x-auto no-scrollbar px-2">
                    <TabButton active={activeTab === 'IDENTITY'} onClick={() => setActiveTab('IDENTITY')} icon={User} label="Identity" />
                    <TabButton active={activeTab === 'VALUES'} onClick={() => setActiveTab('VALUES')} icon={Brain} label="Values" />
                    <TabButton active={activeTab === 'LIFESTYLE'} onClick={() => setActiveTab('LIFESTYLE')} icon={Zap} label="Lifestyle" />
                    <TabButton active={activeTab === 'CONTEXT'} onClick={() => setActiveTab('CONTEXT')} icon={Hash} label="Context" />
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar">

                    {/* --- TAB 1: IDENTITY --- */}
                    {activeTab === 'IDENTITY' && (
                        <div className="space-y-8 max-w-xl mx-auto">
                            <div className="space-y-6">
                                <InputGroup label="Archetype Title">
                                    <input
                                        type="text"
                                        value={formData.title}
                                        onChange={e => updateField('title', e.target.value)}
                                        className="w-full bg-transparent border-b border-zinc-800 pb-2 text-3xl font-bold text-white focus:border-white focus:outline-none placeholder-zinc-800"
                                        placeholder="The Protagonist"
                                    />
                                </InputGroup>

                                <InputGroup label="Manifesto">
                                    <textarea
                                        value={formData.summary}
                                        onChange={e => updateField('summary', e.target.value)}
                                        className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl p-4 text-zinc-300 text-lg leading-relaxed focus:border-white/20 focus:outline-none min-h-[150px] resize-none"
                                        placeholder="I am..."
                                    />
                                </InputGroup>
                            </div>

                            <div className="pt-6 border-t border-white/5">
                                <InputGroup label="Role Models">
                                    <ObjectArrayInput
                                        items={formData.role_models}
                                        onChange={val => updateField('role_models', val)}
                                        fields={[
                                            { key: 'name', placeholder: 'Name', width: '40%' },
                                            { key: 'reason', placeholder: 'Reason', width: '60%' }
                                        ]}
                                        chipStyle
                                    />
                                </InputGroup>
                            </div>

                            {/* Visual Board */}
                            <div className="pt-6 border-t border-white/5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-bold text-zinc-500">Visual Board</label>
                                    <span className="text-xs text-zinc-600">{formData.visual_board.length} Images</span>
                                </div>

                                <VisualBoardInput
                                    items={formData.visual_board}
                                    onChange={val => updateField('visual_board', val)}
                                    userId={user?.uid}
                                />
                            </div>
                        </div>
                    )}

                    {/* --- TAB 2: VALUES (Psychographics) --- */}
                    {activeTab === 'VALUES' && (
                        <div className="space-y-10 max-w-xl mx-auto">
                            <InputGroup label="Core Beliefs">
                                <TagInput
                                    tags={formData.core_beliefs}
                                    onChange={val => updateField('core_beliefs', val)}
                                    placeholder="Add a belief..."
                                />
                            </InputGroup>

                            <InputGroup label="Operating Rules">
                                <ObjectArrayInput
                                    items={formData.rules}
                                    onChange={val => updateField('rules', val)}
                                    fields={[
                                        { key: 'rule', placeholder: 'Rule', width: '40%' },
                                        { key: 'description', placeholder: 'Description...', width: '60%' }
                                    ]}
                                    generateId
                                />
                            </InputGroup>

                            <InputGroup label="Mantras">
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
                        <div className="space-y-10 max-w-xl mx-auto">
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
                        <div className="space-y-8 max-w-xl mx-auto">
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
                                    className="w-full bg-transparent border-b border-zinc-800 pb-2 text-zinc-300 focus:border-white focus:outline-none"
                                    placeholder="Apartment in NYC..."
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
                "h-14 px-6 flex items-center gap-2 text-sm font-medium border-b-2 transition-colors shrink-0",
                active ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
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
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{label}</label>
            {children}
        </div>
    );
}

function TagInput({ tags, onChange, placeholder }: { tags: string[], onChange: (val: string[]) => void, placeholder: string }) {
    const [input, setInput] = useState("");

    const addTag = () => {
        if (input.trim()) {
            onChange([...tags, input.trim()]);
            setInput("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag();
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
                onBlur={addTag}
                placeholder={placeholder}
                className="w-full bg-transparent border-b border-zinc-800 pb-2 text-zinc-300 focus:border-white focus:outline-none"
            />
            <div className="flex flex-wrap gap-2">
                {tags.map((tag, i) => (
                    <div key={i} className="bg-transparent border border-white/20 text-zinc-200 px-4 py-1.5 rounded-full text-sm flex items-center gap-2 hover:bg-white/5 transition-colors">
                        <span>{tag}</span>
                        <button onClick={() => removeTag(i)} className="text-zinc-500 hover:text-white">
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ObjectArrayInput({ items, onChange, fields, generateId, chipStyle }: { items: any[], onChange: (val: any[]) => void, fields: { key: string, placeholder: string, width: string }[], generateId?: boolean, chipStyle?: boolean }) {
    const [newItem, setNewItem] = useState<any>({});
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editItem, setEditItem] = useState<any>({});

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

    const startEditing = (index: number) => {
        setEditingIndex(index);
        setEditItem({ ...items[index] });
    };

    const cancelEditing = () => {
        setEditingIndex(null);
        setEditItem({});
    };

    const saveEditing = () => {
        if (!editItem[fields[0].key]) return; // Validation

        const newItems = [...items];
        newItems[editingIndex!] = editItem;
        onChange(newItems);
        setEditingIndex(null);
        setEditItem({});
    };

    return (
        <div className="space-y-3">
            {/* List Existing */}
            <div className={cn("space-y-4", chipStyle && "space-y-4 flex flex-col gap-0")}>
                {items.map((item, i) => (
                    <div key={i} className={cn(
                        "flex gap-2 items-start group relative pr-16", // Added more padding right for buttons
                        chipStyle ? "bg-white/5 border border-white/10 rounded-2xl px-4 py-3 items-center" : "flex-1"
                    )}>
                        {editingIndex === i ? (
                            <div className="flex-1 flex gap-2 items-center w-full">
                                {fields.map((f) => (
                                    <div key={f.key} style={{ width: f.width }}>
                                        <input
                                            value={editItem[f.key] || ""}
                                            onChange={e => setEditItem({ ...editItem, [f.key]: e.target.value })}
                                            placeholder={f.placeholder}
                                            className="w-full bg-transparent border-b border-white pb-1 text-sm text-white focus:outline-none"
                                            autoFocus={f.key === fields[0].key}
                                        />
                                    </div>
                                ))}
                                <div className="flex items-center gap-1">
                                    <button onClick={saveEditing} className="p-1 text-green-400 hover:text-green-300">
                                        <Check className="w-4 h-4" />
                                    </button>
                                    <button onClick={cancelEditing} className="p-1 text-red-400 hover:text-red-300">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className={cn(
                                    "flex flex-col gap-1 w-full",
                                    chipStyle ? "" : "flex-1 bg-white/5 border border-white/10 rounded-2xl p-4"
                                )}>
                                    {fields.map((f, index) => (
                                        <div
                                            key={f.key}
                                            className="w-full"
                                        >
                                            {/* Render First Field as Title, others as Description */}
                                            <p className={cn(
                                                "break-words whitespace-normal",
                                                index === 0 ? "text-base font-bold text-white mb-0.5" : "text-sm text-zinc-400"
                                            )}>
                                                {item[f.key]}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                                <div className={cn(
                                    "flex items-center gap-1",
                                    chipStyle ? "ml-auto" : "absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-black/50 rounded-lg p-1 backdrop-blur-sm"
                                )}>
                                    <button
                                        onClick={() => startEditing(i)}
                                        className="p-1.5 text-zinc-400 hover:text-white transition-colors"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleRemove(i)}
                                        className="p-1.5 text-zinc-400 hover:text-red-400 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>

            {/* Add New */}
            {/* Only show add new when not editing to reduce clutter/focus */}
            {editingIndex === null && (
                <div className="flex gap-2 items-end mt-4">
                    {fields.map((f, index) => (
                        <div key={f.key} style={{ width: f.width }}>
                            <input
                                value={newItem[f.key] || ""}
                                onChange={e => setNewItem({ ...newItem, [f.key]: e.target.value })}
                                placeholder={f.placeholder}
                                className="w-full bg-transparent border-b border-zinc-700 pb-1 text-sm text-zinc-300 focus:border-white focus:outline-none"
                                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                                onBlur={() => {
                                    // Attempt auto-add if this is the last field and user is clicking away
                                    if (index === fields.length - 1 && newItem[fields[0].key]) {
                                        handleAdd();
                                    }
                                }}
                            />
                        </div>
                    ))}
                    <button
                        onClick={handleAdd}
                        disabled={!newItem[fields[0].key]}
                        className="p-1 text-white hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed bg-zinc-800 rounded-full"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    );
}

function VisualBoardInput({ items, onChange, userId }: { items: any[], onChange: (val: any[]) => void, userId?: string }) {
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !userId) return;

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("userId", userId);

            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.details || "Upload failed");
            }

            const data = await res.json();
            onChange([...items, { image_url: data.url, label: "inspiration" }]);
        } catch (error) {
            console.error("Upload failed:", error);
            alert("Failed to upload image. Please try again.");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleRemove = (index: number) => {
        onChange(items.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-4">
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileSelect}
            />

            {/* Grid */}
            <div className="grid grid-cols-3 gap-2">
                {items.map((item, i) => (
                    <div key={i} className="aspect-square relative group rounded-2xl overflow-hidden bg-zinc-900 border border-white/5">
                        <img src={item.image_url} alt={item.label} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button onClick={() => handleRemove(i)} className="p-2 bg-red-600 rounded-full text-white hover:bg-red-500">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}

                {/* Add Button */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="aspect-square rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-zinc-500 hover:border-white/30 hover:text-zinc-300 transition-all gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isUploading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                    ) : (
                        <Plus className="w-8 h-8" />
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                        {isUploading ? "Uploading..." : "Add"}
                    </span>
                </button>
            </div>
        </div>
    );
}
