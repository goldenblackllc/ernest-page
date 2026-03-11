"use client";

import ReactMarkdown from "react-markdown";

interface DigestCardProps {
    title: string;
    content: string;
    imageUrl?: string | null;
}

export function DigestCard({ title, content, imageUrl }: DigestCardProps) {
    // Strip bold lead-ins like "**The Home:** " from content
    const cleanContent = content.replace(/^\*\*[^*]+:\*\*\s*/gm, '');

    return (
        <div className="bg-[#1a1a1a] border-b sm:border border-white/10 sm:rounded-xl overflow-hidden shadow-sm backdrop-blur-sm font-sans">
            <div className="px-4 sm:px-5 py-4 sm:py-5">
                {/* Image — padded and rounded like standard posts */}
                {imageUrl && (
                    <div className="mb-4">
                        <img
                            src={imageUrl}
                            alt=""
                            className="w-full aspect-video object-cover rounded-xl"
                        />
                    </div>
                )}

                {/* Category title — stark headline */}
                <h3 className="text-xl font-bold text-white tracking-tight mb-2">
                    {title}
                </h3>

                {/* Body text */}
                <div className="text-sm text-zinc-400 leading-relaxed prose prose-invert prose-sm max-w-none
                    prose-strong:text-zinc-300 prose-strong:font-semibold
                    prose-em:text-zinc-300
                    prose-p:my-1">
                    <ReactMarkdown>{cleanContent}</ReactMarkdown>
                </div>
            </div>
        </div>
    );
}
