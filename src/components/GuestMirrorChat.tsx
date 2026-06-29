'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ArrowUp, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';

// ─── Types ─────────────────────────────────────────────────────────
interface GuestMirrorChatProps {
    avatarUrl?: string;
    characterName?: string;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

// ─── Constants ─────────────────────────────────────────────────────
const MAX_INPUT_LENGTH = 2000;

// ─── Strip markdown for TTS ────────────────────────────────────────
function stripMarkdown(text: string): string {
    return text
        .replace(/#{1,6}\s/g, '')         // headings
        .replace(/\*\*(.+?)\*\*/g, '$1')  // bold
        .replace(/\*(.+?)\*/g, '$1')      // italic
        .replace(/__(.+?)__/g, '$1')      // bold alt
        .replace(/_(.+?)_/g, '$1')        // italic alt
        .replace(/`(.+?)`/g, '$1')        // inline code
        .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
        .replace(/>\s/g, '')              // blockquotes
        .replace(/[-*+]\s/g, '')          // list markers
        .replace(/\n{2,}/g, '\n')         // collapse newlines
        .trim();
}

// ─── Component ─────────────────────────────────────────────────────
export function GuestMirrorChat({ avatarUrl: propAvatarUrl, characterName: propCharacterName }: GuestMirrorChatProps) {

    // ── Chat state ──
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sessionId] = useState(() => crypto.randomUUID());

    // ── Character info (from props or first API response) ──
    const [avatarUrl, setAvatarUrl] = useState<string | undefined>(propAvatarUrl);
    const [characterName, setCharacterName] = useState<string | undefined>(propCharacterName);

    // Sync props if they change
    useEffect(() => {
        if (propAvatarUrl) setAvatarUrl(propAvatarUrl);
    }, [propAvatarUrl]);
    useEffect(() => {
        if (propCharacterName) setCharacterName(propCharacterName);
    }, [propCharacterName]);

    // ── Refs ──
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ── TTS state ──
    const [autoSpeak, setAutoSpeak] = useState(true); // Default ON for guests
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isLoadingTTS, setIsLoadingTTS] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const heldMsgIdRef = useRef<string | null>(null); // Message held until TTS is ready
    const [releasedMsgId, setReleasedMsgId] = useState<string | null>(null);

    // ── Fetch character info on mount ──
    useEffect(() => {
        if (avatarUrl && characterName) return;
        fetch('/api/mirror/guest')
            .then(res => res.json())
            .then(data => {
                if (data.avatarUrl && !avatarUrl) setAvatarUrl(data.avatarUrl);
                if (data.characterName && !characterName) setCharacterName(data.characterName);
            })
            .catch(() => {});
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Auto-scroll ──
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, isLoading]);

    // ── Auto-resize textarea ──
    const resizeTextarea = useCallback(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
    }, []);

    useEffect(() => {
        resizeTextarea();
    }, [input, resizeTextarea]);

    // ── TTS: fetch audio ──
    const fetchTTSAudio = useCallback(async (text: string): Promise<Blob | null> => {
        try {
            const cleanText = stripMarkdown(text);
            if (!cleanText) return null;

            const res = await fetch('/api/tts/guest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: cleanText }),
            });

            if (!res.ok) return null;
            return await res.blob();
        } catch {
            return null;
        }
    }, []);

    // ── TTS: play audio blob ──
    const playAudioBlob = useCallback((blob: Blob): Promise<void> => {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;
            setIsSpeaking(true);

            audio.onended = () => {
                setIsSpeaking(false);
                URL.revokeObjectURL(url);
                resolve();
            };
            audio.onerror = () => {
                setIsSpeaking(false);
                URL.revokeObjectURL(url);
                resolve();
            };

            audio.play().catch(() => {
                setIsSpeaking(false);
                URL.revokeObjectURL(url);
                resolve();
            });
        });
    }, []);

    // ── TTS: stop speaking ──
    const stopSpeaking = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setIsSpeaking(false);
    }, []);

    // ── Computed: should we hold the last assistant message? ──
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const shouldHoldLastMessage = lastMsg?.role === 'assistant'
        && heldMsgIdRef.current === lastMsg.id
        && releasedMsgId !== lastMsg.id;

    // ── TTS: toggle handler ──
    const toggleAutoSpeak = useCallback(() => {
        if (autoSpeak) {
            stopSpeaking();
        }
        setAutoSpeak(prev => !prev);
    }, [autoSpeak, stopSpeaking]);

    // ── Cleanup on unmount ──
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // ── Send message ──
    const handleSend = useCallback(async () => {
        const trimmed = input.trim();
        if (!trimmed || isLoading) return;

        // Stop any playing audio
        stopSpeaking();

        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: trimmed,
        };

        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setError(null);
        setIsLoading(true);

        try {
            const formattedMessages = newMessages.map(({ role, content }) => ({ role, content }));
            const res = await fetch('/api/mirror/guest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: formattedMessages,
                    localTime: new Date().toLocaleString(),
                    sessionId,
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                throw new Error(data.error || 'API error');
            }

            // Store character info from first response if not already set via props
            if (!avatarUrl && data.avatarUrl) setAvatarUrl(data.avatarUrl);
            if (!characterName && data.characterName) setCharacterName(data.characterName);

            const assistantMessage: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: data.text,
            };

            // If autoSpeak, hold the message until TTS is ready
            if (autoSpeak) {
                heldMsgIdRef.current = assistantMessage.id;
                setMessages(prev => [...prev, assistantMessage]);
                setIsLoading(false);
                setIsLoadingTTS(true);

                const blob = await fetchTTSAudio(data.text);
                setIsLoadingTTS(false);
                heldMsgIdRef.current = null;
                setReleasedMsgId(assistantMessage.id);
                if (blob) playAudioBlob(blob);
            } else {
                setMessages(prev => [...prev, assistantMessage]);
                setIsLoading(false);
            }
        } catch {
            setError('Something went wrong. Try again.');
            setIsLoading(false);
            heldMsgIdRef.current = null;
        }
    }, [input, isLoading, messages, avatarUrl, characterName, stopSpeaking, autoSpeak, fetchTTSAudio, playAudioBlob]);

    // ── Retry last failed message ──
    const handleRetry = useCallback(() => {
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
        if (!lastUserMsg) return;

        setMessages(prev => prev.filter(m => m.id !== lastUserMsg.id));
        setError(null);
        setInput(lastUserMsg.content);
    }, [messages]);

    // ── Keyboard handling ──
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ── Typing indicator ──
    const TypingIndicator = () => (
        <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
    );

    // ── Render ──
    return (
        <div className="bg-zinc-950 rounded-2xl border border-white/[0.08] flex flex-col w-full overflow-hidden">

            {/* ── Persistent Header ── */}
            <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-zinc-800/50">
                {/* Avatar */}
                {avatarUrl ? (
                    <Image
                        src={avatarUrl}
                        alt="Earnest"
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-full object-cover border-2 border-zinc-700"
                    />
                ) : (
                    <div className="w-10 h-10 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center">
                        <span className="text-base font-semibold text-zinc-400">E</span>
                    </div>
                )}

                {/* Name + online dot */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white">Earnest</span>
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    </div>
                </div>

                {/* Voice toggle */}
                <button
                    onClick={toggleAutoSpeak}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        autoSpeak
                            ? 'bg-zinc-800 border border-zinc-500 text-white'
                            : 'border border-zinc-700 text-zinc-600'
                    } ${isSpeaking ? 'animate-pulse' : ''}`}
                    aria-label={autoSpeak ? 'Mute voice' : 'Enable voice'}
                >
                    {autoSpeak ? <Volume2 size={14} /> : <VolumeX size={14} />}
                </button>
            </div>

            {/* ── Messages area ── */}
            <div ref={scrollRef} className={`overflow-y-auto space-y-3 ${messages.length > 0 ? 'flex-1 max-h-[500px] min-h-[200px] p-5 sm:p-8' : 'p-0'}`}>



                {/* Messages — filter out held message */}
                <AnimatePresence mode="popLayout">
                    {messages
                        .filter(msg => !(shouldHoldLastMessage && msg.id === lastMsg?.id))
                        .map(msg => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.15, ease: 'easeOut' }}
                            className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={
                                    msg.role === 'user'
                                        ? 'bg-zinc-800 text-zinc-100 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[92%] break-words text-[15px] leading-relaxed'
                                        : 'bg-zinc-900/60 border border-white/10 text-zinc-100 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[92%] break-words text-[15px] leading-relaxed'
                                }
                            >
                                {msg.role === 'assistant' ? (
                                    <div className="prose prose-invert prose-sm prose-p:leading-relaxed prose-a:text-zinc-200 prose-strong:text-white max-w-none whitespace-pre-wrap">
                                        <ReactMarkdown remarkPlugins={[remarkBreaks]}>{msg.content}</ReactMarkdown>
                                    </div>
                                ) : (
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                )}
                            </div>
                        </motion.div>
                    ))}

                    {/* Loading / typing indicator */}
                    {(isLoading || shouldHoldLastMessage) && (
                        <motion.div
                            key="typing"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15, ease: 'easeOut' }}
                            className="flex justify-start"
                        >
                            <div className="bg-zinc-900/60 border border-white/10 text-zinc-100 rounded-2xl rounded-tl-sm px-4 py-3">
                                <TypingIndicator />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Error toast */}
                {error && (
                    <div className="flex items-center gap-2 text-xs text-red-400 px-4 py-2">
                        <span>Something went wrong. Try again.</span>
                        <button
                            onClick={handleRetry}
                            className="underline hover:text-red-300 transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                )}

            </div>

            {/* ── Input area ── */}
            <div className="p-3">
                <div className="relative bg-zinc-900/50 border border-white/10 rounded-xl p-3 transition-all focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-500">
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => {
                            if (e.target.value.length <= MAX_INPUT_LENGTH) {
                                setInput(e.target.value);
                            }
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="What's on your mind?"
                        disabled={isLoading}
                        rows={1}
                        className="w-full bg-transparent text-white px-1 pr-12 min-h-[44px] max-h-[120px] resize-none focus:outline-none placeholder:text-zinc-400 text-base leading-relaxed"
                    />
                    <div className="absolute right-3 bottom-3">
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center flex-shrink-0 transition-opacity disabled:opacity-30"
                            aria-label="Send message"
                        >
                            <ArrowUp size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
