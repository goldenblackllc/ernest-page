import { Entry } from "@/lib/firebase/schema";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface EntryCardProps {
    entry: Entry;
    className?: string;
}

export function EntryCard({ entry, className }: EntryCardProps) {
    return (
        <article className={cn("break-inside-avoid mb-6 border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm p-8 rounded-xl", className)}>
            {entry.image_url && (
                <div className="aspect-video w-full overflow-hidden border border-zinc-800 mb-4 rounded-lg grayscale contrast-125 hover:grayscale-0 transition-all duration-700">
                    <img src={entry.image_url} alt={entry.headline} className="w-full h-full object-cover" />
                </div>
            )}
            <h2 className="font-bold text-xl uppercase tracking-wide text-zinc-100 mb-2 leading-tight">{entry.headline}</h2>
            <div className="flex justify-between items-center text-[10px] text-zinc-500 uppercase tracking-widest border-t border-zinc-800 pt-3 mt-2">
                <span>{entry.status}</span>
                {/* Placeholder for date since I didn't install date-fns yet, or could use standard JS date */}
                <span>{new Date().toLocaleDateString()}</span>
            </div>
            <p className="mt-4 text-sm leading-loose text-zinc-300">{entry.unexpected_outcome}</p>
        </article>
    );
}
