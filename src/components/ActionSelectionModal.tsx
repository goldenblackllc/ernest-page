"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { X, Plus } from "lucide-react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";

interface ActionSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
}



export function ActionSelectionModal({ isOpen, onClose }: ActionSelectionModalProps) {
    const { user } = useAuth();
    const [options, setOptions] = useState<string[]>([]);
    const [newOption, setNewOption] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Reset options when modal opens
    useEffect(() => {
        if (isOpen) {
            setOptions([]);
            setNewOption("");
        }
    }, [isOpen]);

    const handleAddOption = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newOption.trim()) return;

        if (options.length >= 5) {
            alert("Maximum 5 options allowed.");
            return;
        }

        const updatedOptions = [...options, newOption.trim()];
        setOptions(updatedOptions);
        setNewOption("");
    };

    const handleRemoveOption = (e: React.MouseEvent, index: number) => {
        e.stopPropagation();
        const updatedOptions = options.filter((_, i) => i !== index);
        setOptions(updatedOptions);
    };

    const handleSelectOption = async (option: string) => {
        if (!user) return;
        setIsLoading(true);

        try {
            // Create action document
            await addDoc(collection(db, "entries"), {
                uid: user.uid,
                type: "action",
                title: option,
                status: "in_progress",
                startedAt: serverTimestamp(),
            });

            // Just close the modal, dashboard will update
            onClose();
        } catch (error) {
            console.error("Error starting action:", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md p-0 border border-black bg-white shadow-none rounded-none">
                <div className="p-8">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-tight text-black mb-2">
                                What are your choices?
                            </h2>
                            <p className="text-sm text-gray-600 leading-snug">
                                In this moment, you only have so many things that you can do. Make a list of options. Identify the most exciting one that you can act on with integrity, and select it.
                            </p>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-black transition-colors -mt-1 -mr-1">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleAddOption} className="mb-8 relative">
                        <input
                            type="text"
                            value={newOption}
                            onChange={(e) => setNewOption(e.target.value)}
                            placeholder="Enter choice"
                            className="w-full border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-black focus:ring-0 rounded-none pr-12"
                            disabled={options.length >= 5}
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={options.length >= 5 || !newOption.trim()}
                            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-black disabled:opacity-30 transition-colors"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    </form>

                    <div className="space-y-4">
                        {options.length === 0 && (
                            <p className="text-center text-sm text-gray-400 italic py-4">
                                Add your first option above...
                            </p>
                        )}
                        {options.map((option, index) => (
                            <div key={index} className="relative group">
                                <button
                                    onClick={() => !isLoading && handleSelectOption(option)}
                                    className="btn btn-outline-dark w-full text-center hover:bg-black hover:text-white transition-all uppercase tracking-widest font-bold py-3 px-10 border border-black"
                                >
                                    {option}
                                </button>
                                <button
                                    onClick={(e) => handleRemoveOption(e, index)}
                                    className="absolute right-3 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 transition-all z-10"
                                    title="Remove option"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {isLoading && (
                        <div className="mt-8 text-center text-[10px] font-bold uppercase tracking-widest text-gray-400 animate-pulse">
                            Initializing...
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
