import { Entry } from "@/lib/firebase/schema";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface EntryCardProps {
    entry: Entry;
    className?: string;
}

export function EntryCard({ entry, className }: EntryCardProps) {
    return (
        <article className={cn("break-inside-avoid mb-6 border-b-2 border-black pb-4", className)}>
            {entry.image_url && (
                <div className="aspect-video w-full overflow-hidden border-2 border-black mb-3 grayscale contrast-125">
                    <img src={entry.image_url} alt={entry.headline} className="w-full h-full object-cover" />
                </div>
            )}
            <h2 className="font-serif text-2xl font-bold leading-tight mb-2">{entry.headline}</h2>
            <div className="flex justify-between items-center text-sm font-sans uppercase tracking-widest border-t border-black pt-2 mt-2">
                <span>{entry.status}</span>
                {/* Placeholder for date since I didn't install date-fns yet, or could use standard JS date */}
                <span>{new Date().toLocaleDateString()}</span>
            </div>
            <p className="mt-2 font-serif text-lg leading-relaxed">{entry.unexpected_outcome}</p>
        </article>
    );
}
