import { useState, KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface StreamInputProps {
    onAdd: (text: string, category: "FEELING" | "THOUGHT" | "ACTION") => void;
}

export function StreamInput({ onAdd }: StreamInputProps) {
    const [text, setText] = useState("");

    const handleAdd = (category: "FEELING" | "THOUGHT" | "ACTION") => {
        if (!text.trim()) return;
        onAdd(text.trim(), category);
        setText("");
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
    };

    return (
        <div className="space-y-2">
            <div className="relative">
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a feeling, thought, or action..."
                    className="w-full border border-gray-300 bg-transparent px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-0 rounded-none transition-colors pr-32" // Added padding-right if buttons overlay, or just kept simple
                    maxLength={140}
                />
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => handleAdd("FEELING")}
                    className="text-xs font-bold uppercase tracking-wider px-3 py-1 border border-gray-300 hover:border-black hover:bg-black hover:text-white transition-colors bg-white text-gray-600"
                >
                    + FEELING
                </button>
                <button
                    type="button"
                    onClick={() => handleAdd("THOUGHT")}
                    className="text-xs font-bold uppercase tracking-wider px-3 py-1 border border-gray-300 hover:border-black hover:bg-black hover:text-white transition-colors bg-white text-gray-600"
                >
                    + THOUGHT
                </button>
                <button
                    type="button"
                    onClick={() => handleAdd("ACTION")}
                    className="text-xs font-bold uppercase tracking-wider px-3 py-1 border border-gray-300 hover:border-black hover:bg-black hover:text-white transition-colors bg-white text-gray-600"
                >
                    + ACTION
                </button>
            </div>
        </div>
    );
}
