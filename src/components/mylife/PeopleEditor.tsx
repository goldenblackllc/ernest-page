'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Users, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { ProfilePerson } from '@/types/character';
import { cn } from '@/lib/utils';

export interface PeopleEditorProps {
    people: ProfilePerson[];
    onSave: (people: ProfilePerson[]) => void;
    className?: string;
}

/**
 * PeopleEditor provides a structured list editor for "My People".
 * Supports accordion expansion, adding, deleting, and saving on blur.
 */
export function PeopleEditor({ people = [], onSave, className }: PeopleEditorProps) {
    // Local state for smooth edits
    const [items, setItems] = useState<ProfilePerson[]>(people);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

    // Keep ref in sync for synchronous access during blur events
    const itemsRef = useRef<ProfilePerson[]>(items);

    // Ref to trigger auto-focus on newly added person after render
    const shouldFocusNameRef = useRef(false);
    const nameInputRef = useRef<HTMLInputElement | null>(null);

    // Sync state when props change (React recommended pattern for state derived from props)
    const [prevPeople, setPrevPeople] = useState(people);
    if (people !== prevPeople) {
        setPrevPeople(people);
        setItems(people);
        if (expandedIndex !== null && expandedIndex >= people.length) {
            setExpandedIndex(null);
        }
    }

    // Keep itemsRef in sync outside of render
    useEffect(() => {
        itemsRef.current = items;
    }, [items]);

    // Auto-focus name field on newly added person
    useEffect(() => {
        if (shouldFocusNameRef.current) {
            shouldFocusNameRef.current = false;
            if (nameInputRef.current) {
                nameInputRef.current.focus();
                nameInputRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
            }
        }
    });

    // Handle accordion toggle
    const handleToggleExpand = (index: number) => {
        setExpandedIndex((prev) => (prev === index ? null : index));
    };

    // Update field value in local state
    const handleFieldChange = (index: number, field: keyof ProfilePerson, value: string) => {
        setItems((prev) => {
            const next = prev.map((item, i) => (i === index ? { ...item, [field]: value } : item));
            itemsRef.current = next;
            return next;
        });
    };

    // Save on blur of any field
    const handleFieldBlur = () => {
        onSave(itemsRef.current);
    };

    // Add new empty person and expand it
    const handleAddPerson = () => {
        const newPerson: ProfilePerson = { name: '', relationship: '' };
        const next = [...itemsRef.current, newPerson];
        itemsRef.current = next;
        setItems(next);
        setExpandedIndex(next.length - 1);
        shouldFocusNameRef.current = true;
    };

    // Delete a person
    const handleDelete = (indexToDelete: number) => {
        const next = itemsRef.current.filter((_, idx) => idx !== indexToDelete);
        itemsRef.current = next;
        setItems(next);
        if (expandedIndex === indexToDelete) {
            setExpandedIndex(null);
        } else if (expandedIndex !== null && expandedIndex > indexToDelete) {
            setExpandedIndex(expandedIndex - 1);
        }
        onSave(next);
    };

    const inputClasses = cn(
        'w-full bg-zinc-800/50 rounded-lg border border-zinc-700/50 px-3 py-2 text-white text-sm',
        'placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50',
        'transition-colors'
    );

    const textareaClasses = cn(inputClasses, 'resize-none min-h-[60px]');

    return (
        <div className={cn('flex flex-col h-full w-full min-h-0', className)}>
            {/* Title Header */}
            <div className="flex items-center gap-2 pb-4 shrink-0 border-b border-zinc-800/50">
                <Users className="w-5 h-5 text-amber-400 shrink-0" />
                <h2 className="text-xl font-bold text-white">My People</h2>
            </div>

            {/* Scrollable list of people */}
            <div className="flex-1 overflow-y-auto min-h-0 py-1 pr-1">
                {items.length === 0 ? (
                    <div className="py-8 text-center text-sm text-zinc-500">
                        No people added yet. Tap below to add someone.
                    </div>
                ) : (
                    items.map((person, index) => {
                        const isExpanded = expandedIndex === index;

                        return (
                            <div key={index} className="border-b border-zinc-800/50 py-2">
                                {isExpanded ? (
                                    /* Expanded View */
                                    <div className="py-2 px-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/60 space-y-4">
                                        {/* Header Row in Expanded State */}
                                        <div className="flex items-center justify-between">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleExpand(index)}
                                                className="flex items-center gap-2 min-w-0 flex-1 mr-2 text-left group select-none cursor-pointer"
                                                aria-expanded={true}
                                            >
                                                <span className="font-medium text-white truncate">
                                                    {person.name.trim() || 'Unnamed'}
                                                </span>
                                                <span className="text-zinc-600 select-none">—</span>
                                                <span className="text-zinc-400 italic truncate text-sm">
                                                    {person.relationship.trim() || 'No relationship'}
                                                </span>
                                                <ChevronUp className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(index)}
                                                className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors rounded hover:bg-zinc-800/50 shrink-0 cursor-pointer"
                                                title="Delete person"
                                                aria-label={`Delete ${person.name || 'person'}`}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* Form Fields */}
                                        <div className="space-y-3.5 pt-1">
                                            {/* Name (Required) */}
                                            <div>
                                                <label
                                                    htmlFor={`person-${index}-name`}
                                                    className="block text-xs text-zinc-500 uppercase tracking-wide mb-1 font-medium"
                                                >
                                                    Name
                                                </label>
                                                <input
                                                    id={`person-${index}-name`}
                                                    ref={isExpanded ? nameInputRef : null}
                                                    type="text"
                                                    required
                                                    value={person.name}
                                                    onChange={(e) =>
                                                        handleFieldChange(index, 'name', e.target.value)
                                                    }
                                                    onBlur={handleFieldBlur}
                                                    placeholder="Full name"
                                                    className={inputClasses}
                                                />
                                            </div>

                                            {/* Relationship (Required) */}
                                            <div>
                                                <label
                                                    htmlFor={`person-${index}-relationship`}
                                                    className="block text-xs text-zinc-500 uppercase tracking-wide mb-1 font-medium"
                                                >
                                                    Relationship
                                                </label>
                                                <input
                                                    id={`person-${index}-relationship`}
                                                    type="text"
                                                    required
                                                    value={person.relationship}
                                                    onChange={(e) =>
                                                        handleFieldChange(index, 'relationship', e.target.value)
                                                    }
                                                    onBlur={handleFieldBlur}
                                                    placeholder="e.g. Partner, Friend, Coworker"
                                                    className={inputClasses}
                                                />
                                            </div>

                                            {/* About them (Optional) */}
                                            <div>
                                                <label
                                                    htmlFor={`person-${index}-who`}
                                                    className="block text-xs text-zinc-500 uppercase tracking-wide mb-1 font-medium"
                                                >
                                                    About them
                                                </label>
                                                <textarea
                                                    id={`person-${index}-who`}
                                                    value={person.who ?? ''}
                                                    onChange={(e) =>
                                                        handleFieldChange(index, 'who', e.target.value)
                                                    }
                                                    onBlur={handleFieldBlur}
                                                    placeholder="Age, personality, interests..."
                                                    className={textareaClasses}
                                                />
                                            </div>

                                            {/* Your dynamic (Optional) */}
                                            <div>
                                                <label
                                                    htmlFor={`person-${index}-dynamic`}
                                                    className="block text-xs text-zinc-500 uppercase tracking-wide mb-1 font-medium"
                                                >
                                                    Your dynamic
                                                </label>
                                                <textarea
                                                    id={`person-${index}-dynamic`}
                                                    value={person.dynamic ?? ''}
                                                    onChange={(e) =>
                                                        handleFieldChange(index, 'dynamic', e.target.value)
                                                    }
                                                    onBlur={handleFieldBlur}
                                                    placeholder="Your relationship with them..."
                                                    className={textareaClasses}
                                                />
                                            </div>

                                            {/* Birthday (Optional) */}
                                            <div>
                                                <label
                                                    htmlFor={`person-${index}-birthday`}
                                                    className="block text-xs text-zinc-500 uppercase tracking-wide mb-1 font-medium"
                                                >
                                                    Birthday
                                                </label>
                                                <input
                                                    id={`person-${index}-birthday`}
                                                    type="text"
                                                    value={person.birthday ?? ''}
                                                    onChange={(e) =>
                                                        handleFieldChange(index, 'birthday', e.target.value)
                                                    }
                                                    onBlur={handleFieldBlur}
                                                    placeholder="MM-DD or YYYY-MM-DD"
                                                    className={inputClasses}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* Collapsed View */
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleToggleExpand(index)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleToggleExpand(index);
                                            }
                                        }}
                                        className="flex items-center justify-between py-2.5 px-2 rounded-lg cursor-pointer hover:bg-zinc-800/30 transition-colors group select-none text-left"
                                        aria-expanded={false}
                                    >
                                        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                            <span className="font-medium text-white truncate">
                                                {person.name.trim() || 'Unnamed'}
                                            </span>
                                            <span className="text-zinc-600 select-none">—</span>
                                            <span className="text-zinc-400 italic truncate text-sm">
                                                {person.relationship.trim() || 'No relationship'}
                                            </span>
                                        </div>
                                        <ChevronDown className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Bottom Add Person Button */}
            <div className="pt-3 shrink-0">
                <button
                    type="button"
                    onClick={handleAddPerson}
                    className="flex items-center gap-1.5 text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors py-2 px-1 focus:outline-none cursor-pointer"
                >
                    + Add a person
                </button>
            </div>
        </div>
    );
}

export default PeopleEditor;
