import React from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';
import { EcosystemAd } from '@/config/ecosystem';

interface FeedAdCardProps {
    ad: EcosystemAd;
}

export function FeedAdCard({ ad }: FeedAdCardProps) {
    return (
        <article className="group bg-zinc-900/30 border border-zinc-800 rounded-3xl overflow-hidden hover:border-zinc-700 transition-colors relative isolate">
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-zinc-900/50 to-transparent" />

            <div className="p-6 sm:p-8 flex flex-col gap-6">
                {/* Header */}
                <header className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-zinc-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        Ecosystem Partner
                    </span>
                </header>

                {/* Body Content */}
                <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
                    <div className="flex-1 space-y-2">
                        <h3 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                            {ad.title}
                        </h3>
                        {ad.description && (
                            <p className="text-sm text-zinc-400 leading-relaxed">
                                {ad.description}
                            </p>
                        )}
                    </div>

                    {/* Visual element */}
                    <div className={`w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-2xl ${ad.imageColor} shadow-inner bg-gradient-to-br from-white/10 to-transparent border border-white/5 flex items-center justify-center`}>
                        <ExternalLink className="w-6 h-6 text-white/50" />
                    </div>
                </div>

                {/* Footer Action */}
                <footer className="pt-2">
                    <a
                        href={ad.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full"
                    >
                        <button className="w-full bg-white text-black hover:bg-zinc-200 text-sm font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                            {ad.cta}
                        </button>
                    </a>
                </footer>
            </div>
        </article>
    );
}
