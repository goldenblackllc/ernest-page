import { X, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StreamItem {
    id: string;
    text: string;
    category: "FEELING" | "THOUGHT" | "ACTION";
}

interface StreamListProps {
    items: StreamItem[];
    top3Feelings: string[]; // Array of IDs
    onDelete: (id: string) => void;
    onToggleFeeling: (id: string) => void;
}

export function StreamList({ items, top3Feelings, onDelete, onToggleFeeling }: StreamListProps) {
    // Only show helper text if there are items and feelings present
    const hasFeelings = items.some(item => item.category === "FEELING");

    return (
        <div className="space-y-4">
            {hasFeelings && (
                <p className="text-[10px] md:text-xs font-bold uppercase tracking-[0.15em] text-gray-500 mb-2">
                    Select your top 3 feelings.
                </p>
            )}

            <div className="border border-gray-300 max-h-64 overflow-y-auto bg-white">
                {items.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-xs text-gray-400 uppercase tracking-widest">
                            The stream is empty
                        </p>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {items.map((item) => {
                            const isFeeling = item.category === "FEELING";
                            const isSelected = top3Feelings.includes(item.id);

                            return (
                                <li
                                    key={item.id}
                                    className={cn(
                                        "group flex items-start justify-between px-4 py-2 hover:bg-gray-50 transition-colors",
                                        isSelected && "bg-gray-50"
                                    )}
                                >
                                    <div className="flex items-start gap-3 flex-1">
                                        {isFeeling && (
                                            <button
                                                type="button"
                                                onClick={() => onToggleFeeling(item.id)}
                                                className="mt-0.5 flex-shrink-0 focus:outline-none"
                                                aria-label={isSelected ? "Unselect feeling" : "Select feeling"}
                                            >
                                                <Star
                                                    className={cn(
                                                        "w-4 h-4 transition-colors",
                                                        isSelected ? "fill-black text-black" : "text-gray-300 hover:text-gray-900"
                                                    )}
                                                />
                                            </button>
                                        )}
                                        {/* Spacer for non-feeling items to align text if desired, or just let them be naturally aligned. 
                                            The design usually prefers alignment. If "FEELING" has an icon, others might need a spacer.
                                            However, generic "Stream" often mixes types.
                                            Let's keep it simple. If alignment is needed, we can add a w-4 placeholder.
                                        */}
                                        {!isFeeling && <div className="w-4 h-4 flex-shrink-0" />}

                                        <div className="space-y-0.5">
                                            <p className={cn(
                                                "text-sm font-medium leading-snug",
                                                isSelected ? "text-black" : "text-gray-900"
                                            )}>
                                                {item.text}
                                            </p>
                                            <span className={cn(
                                                "inline-block text-[9px] font-bold uppercase tracking-[0.2em]",
                                                item.category === "FEELING" ? "text-blue-600" :
                                                    item.category === "THOUGHT" ? "text-purple-600" :
                                                        "text-green-600"
                                            )}>
                                                {item.category}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => onDelete(item.id)}
                                        className="text-gray-300 hover:text-red-500 transition-colors p-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                        aria-label="Delete item"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
