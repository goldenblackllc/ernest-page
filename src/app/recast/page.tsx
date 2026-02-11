"use client";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { useChat } from '@ai-sdk/react';
import { useEffect, useRef } from "react";

export default function RecastPage() {
    const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
        api: '/api/recast',
    } as any) as any;

    // Auto-scroll to bottom of chat
    const messagesEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <main className="min-h-screen pb-20">
            <Header />
            <div className="container mx-auto px-4 max-w-2xl">
                <h2 className="font-serif text-4xl font-black mb-12 text-center">RECAST BELIEFS</h2>

                {/* Chat History */}
                <div className="space-y-6 mb-8">
                    {messages.map((m: any) => (
                        <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[80%] p-6 border-2 border-black ${m.role === 'user' ? 'bg-white' : 'bg-black text-white'}`}>
                                <h3 className="font-sans font-bold uppercase tracking-widest mb-2 text-xs opacity-50">
                                    {m.role === 'user' ? 'SOURCE: YOU' : 'SOURCE: EARNEST SYSTEM'}
                                </h3>
                                <p className="font-serif text-lg whitespace-pre-wrap">{m.content}</p>
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={handleSubmit} className="border-2 border-black p-6 mb-8 sticky bottom-4 bg-white z-10 shadow-none">
                    <label className="block font-sans font-bold uppercase tracking-widest mb-4">INPUT RAW DATASTREAM</label>
                    <textarea
                        className="w-full min-h-[100px] text-lg font-serif p-4 border-2 border-black focus:outline-none focus:ring-0 transition-colors resize-none mb-4 rounded-none placeholder:text-black/50"
                        placeholder="Define current friction parameters..."
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e as any);
                            }
                        }}
                    />
                    <div className="text-right">
                        <Button type="submit" disabled={isLoading || !input} className="rounded-none">
                            {isLoading ? "PROCESSING..." : "SUBMIT FOR ANALYSIS"}
                        </Button>
                    </div>
                </form>
            </div>
        </main>
    );
}
