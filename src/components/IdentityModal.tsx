"use client";

import { X } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";

interface IdentityModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialText: string;
    onUpdate: (text: string) => Promise<void>;
}

export function IdentityModal({ isOpen, onClose, initialText, onUpdate }: IdentityModalProps) {
    const [text, setText] = useState(initialText);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setText(initialText);
        setError(null);
    }, [initialText, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setError(null);
        try {
            // Add a timeout to prevent infinite hanging
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Request timed out")), 10000)
            );

            await Promise.race([onUpdate(text), timeoutPromise]);
            onClose();
        } catch (err: any) {
            console.error("Failed to update identity:", err);
            setError(err.message || "Failed to update. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <h2 className="text-xl font-bold uppercase tracking-widest text-gray-900">Define Your Identity</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6">
                    <p className="text-sm text-gray-500 mb-4">
                        Who are you? How do you want to show up in the world right now?
                    </p>
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-md border border-red-100">
                            {error}
                        </div>
                    )}
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="I am a person who..."
                        className="w-full h-48 p-4 border border-gray-200 rounded-md bg-gray-50 focus:bg-white focus:ring-2 focus:ring-black focus:border-transparent outline-none resize-none transition-all text-lg font-light leading-relaxed scrollbar-hide"
                        autoFocus
                    />
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !text.trim()}
                        className="bg-black text-white hover:bg-gray-800"
                    >
                        {isSubmitting ? "Updating..." : "UPDATE DEFINITION"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
