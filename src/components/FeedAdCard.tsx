'use client';

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { EcosystemAd } from '@/config/ecosystem';

interface FeedAdCardProps {
    ad: EcosystemAd;
}

export function FeedAdCard({ ad }: FeedAdCardProps) {
    const hasRichContent = ad.headline && ad.body && ad.imageUrl;

    return (
        <article className="bg-[#1a1a1a] border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-sm backdrop-blur-sm relative font-sans">
            {/* Header — Brand Profile */}
            <div className="flex flex-row items-center gap-3 px-3 sm:px-4 py-3 sm:py-4 border-b border-white/5 bg-black/20 w-full">
                <div className="shrink-0">
                    <div className={`w-10 h-10 rounded-full ${ad.imageColor || 'bg-zinc-800'} flex items-center justify-center border border-white/10 overflow-hidden`}>
                        <span className="text-xs font-bold text-white/60">
                            {ad.brand?.charAt(0) || '?'}
                        </span>
                    </div>
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-sm font-semibold text-zinc-100 truncate">
                        {ad.brand || 'Partner'}
                    </span>
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mt-0.5">
                        {ad.meta || 'Sponsored'}
                    </span>
                </div>
            </div>

            {/* Body */}
            <div className="p-0 flex flex-col pt-4">
                {/* Hero Image */}
                {ad.imageUrl && (
                    <div className="px-3 sm:px-4 mb-3">
                        <div className="relative w-full aspect-[21/9] sm:aspect-video rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800">
                            <img
                                src={ad.imageUrl}
                                alt={ad.headline || ad.title}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </div>
                )}

                {/* Copy */}
                <div className="px-3 sm:px-4 pb-3 sm:pb-4">
                    <h2 className="font-bold text-lg text-zinc-100 leading-tight">
                        {ad.headline || ad.title}
                    </h2>
                    {(ad.body || ad.description) && (
                        <p className="text-base text-zinc-300 leading-relaxed mt-2">
                            {ad.body || ad.description}
                        </p>
                    )}
                </div>

                {/* CTA */}
                <div className="px-3 sm:px-4 pb-4 sm:pb-5">
                    <a
                        href={ad.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full"
                    >
                        <button className="w-full bg-white text-black font-semibold rounded-xl py-3 flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors duration-200 active:scale-[0.98] text-sm sm:text-base">
                            {ad.cta}
                            {!hasRichContent && <ExternalLink className="w-4 h-4" />}
                        </button>
                    </a>
                </div>
            </div>
        </article>
    );
}
