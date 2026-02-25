"use client";

import React, { useState, useEffect } from "react";
import { CharacterBible } from "@/types/character";
import { updateCharacterBible } from "@/lib/firebase/character";
import { X, Save, Plus, Trash2, Camera, Calendar, User, Heart, Brain, Zap, Hash, Pencil, Check, Sparkles } from "lucide-react";
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
    const [formData, setFormData] = useState<CharacterBible>(initialData);
    const [isVisualizing, setIsVisualizing] = useState(false);

    // Reset form when modal opens with new data
    useEffect(() => {
        setFormData(initialData);
    }, [initialData, isOpen]);

    const handleVisualize = async () => {
        if (!user) return;
        setIsVisualizing(true);
        try {
            await updateCharacterBible(user.uid, formData);

            // Call compile API
            const response = await fetch('/api/character/compile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: user.uid, source_code: formData.source_code })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.error || "Failed to compile character bible");
            }
            onClose();
        } catch (error: any) {
            console.error("Failed to visualize:", error);
            alert(error.message || "Failed to visualize character sheet.");
        } finally {
            setIsVisualizing(false);
        }
    };

    const updateSourceCode = (field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            source_code: {
                ...prev.source_code,
                [field]: value
            }
        }));
    };

    const updateCompiledBible = (field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            compiled_bible: {
                ...prev.compiled_bible,
                [field]: value
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
                            onClick={handleVisualize}
                            disabled={isVisualizing}
                            className="bg-zinc-100 text-black hover:bg-white text-sm font-bold px-5 py-2 rounded-full flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            {isVisualizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {isVisualizing ? "Visualizing..." : "Visualize"}
                        </button>
                        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors bg-zinc-900/50 rounded-full p-2">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Scrollable Content (Flattened Form) */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar">
                    <div className="space-y-8 max-w-xl mx-auto pb-10">
                        <div className="space-y-6">
                            <InputGroup label="Archetype Title">
                                <input
                                    type="text"
                                    value={formData.source_code?.archetype || ""}
                                    onChange={e => updateSourceCode('archetype', e.target.value)}
                                    className="w-full bg-transparent border-b border-zinc-800 pb-2 text-3xl font-bold text-white focus:border-white focus:outline-none placeholder-zinc-800"
                                    placeholder="The Protagonist"
                                />
                            </InputGroup>

                            <InputGroup label="Manifesto">
                                <textarea
                                    value={formData.source_code?.manifesto || ""}
                                    onChange={e => updateSourceCode('manifesto', e.target.value)}
                                    className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl p-4 text-zinc-300 text-base leading-relaxed focus:border-white/20 focus:outline-none min-h-[160px] resize-none"
                                    placeholder="I am..."
                                    rows={6}
                                />
                            </InputGroup>
                        </div>

                        <div className="pt-6 border-t border-white/5">
                            <InputGroup label="Important People">
                                <textarea
                                    value={formData.source_code?.important_people || ""}
                                    onChange={e => updateSourceCode('important_people', e.target.value)}
                                    className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl p-4 text-zinc-300 text-base leading-relaxed focus:border-white/20 focus:outline-none min-h-[160px] resize-none"
                                    placeholder="Family, mentors, key relationships..."
                                    rows={6}
                                />
                            </InputGroup>
                        </div>

                        <div className="pt-6 border-t border-white/5">
                            <InputGroup label="Things I Enjoy (Preferences & Aesthetics)">
                                <textarea
                                    value={formData.source_code?.things_i_enjoy || ""}
                                    onChange={e => updateSourceCode('things_i_enjoy', e.target.value)}
                                    className="w-full bg-zinc-900/50 border border-white/10 rounded-2xl p-4 text-zinc-300 text-base leading-relaxed focus:border-white/20 focus:outline-none min-h-[160px] resize-none"
                                    placeholder="Black coffee, high-quality steaks, quiet mornings, 90 Day Fiancé, reading..."
                                    rows={6}
                                />
                            </InputGroup>
                        </div>

                        {/* Visual Board */}
                        <div className="pt-6 border-t border-white/5 space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-bold text-zinc-500">Visual Board</label>
                                <span className="text-xs text-zinc-600">{formData.compiled_bible?.visual_board?.length || 0} Images</span>
                            </div>

                            <VisualBoardInput
                                items={formData.compiled_bible?.visual_board || []}
                                onChange={val => updateCompiledBible('visual_board', val)}
                                userId={user?.uid}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- SUB COMPONENTS ---

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
