"use client";

import React, { useEffect, useRef, useState } from "react";
import { RefreshCcw, AlertTriangle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { updateCharacterProfile } from "@/lib/firebase/character";
import { useAuth } from "@/context/AuthContext";
import { functions } from "@/lib/firebase/config";
import { httpsCallable } from "firebase/functions";
import { useTranslations, useLocale } from 'next-intl';
import { useAudioMute } from "@/context/AudioMuteContext";
import type { Message, SessionRouting } from "@/types/chat";
import { useMirrorSession, mirrorLocalTime, MAX_EXCHANGES, MAX_SESSION_HOURS } from "@/hooks/useMirrorSession";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { useCharacterTTS } from "@/hooks/useCharacterTTS";
import { MirrorHeader } from "@/components/mirror/MirrorHeader";
import { MirrorMessageList } from "@/components/mirror/MirrorMessageList";
import { RoutingMenu } from "@/components/mirror/RoutingMenu";
import { MirrorInputBar } from "@/components/mirror/MirrorInputBar";

const mirrorPlan = httpsCallable<
    { messages: unknown[]; localTime: string; locale: string },
    { success: boolean; directives: string[] }
>(functions, 'mirrorPlan', { timeout: 300_000 });

interface MirrorChatProps {
    isOpen: boolean;
    onClose: () => void;
    profile: any | null;
    uid: string;
    initialContext?: string | null;
    defaultPostRouting?: 'private' | 'public' | 'burn';
}

export function MirrorChat({ isOpen, onClose, profile, uid, initialContext, defaultPostRouting }: MirrorChatProps) {
    const { user: authUser } = useAuth();
    const t = useTranslations();
    const locale = useLocale();
    const { suppressAutoPlay, unsuppressAutoPlay } = useAudioMute();

    // Suppress feed auto-play while MirrorChat is open
    useEffect(() => {
        if (isOpen) {
            suppressAutoPlay();
        } else {
            unsuppressAutoPlay();
        }
    }, [isOpen, suppressAutoPlay, unsuppressAutoPlay]);
    const [input, setInput] = useState("");
    const [isRoutingOpen, setIsRoutingOpen] = useState(false);

    // Layout measurement — three-zone keyboard-safe layout
    const headerRef = useRef<HTMLDivElement>(null);
    const inputZoneRef = useRef<HTMLDivElement>(null);
    const [headerHeight, setHeaderHeight] = useState(88);
    const [inputZoneHeight, setInputZoneHeight] = useState(80);

    useEffect(() => {
        if (!isOpen) return;
        const ro = new ResizeObserver(() => {
            if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
            if (inputZoneRef.current) setInputZoneHeight(inputZoneRef.current.offsetHeight);
        });
        if (headerRef.current) ro.observe(headerRef.current);
        if (inputZoneRef.current) ro.observe(inputZoneRef.current);
        // Initial measurement
        if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
        if (inputZoneRef.current) setInputZoneHeight(inputZoneRef.current.offsetHeight);
        return () => ro.disconnect();
    }, [isOpen]);
    const [sessionRouting, setSessionRouting] = useState<SessionRouting>(
        defaultPostRouting || 'public'
    );
    const hasManuallySetRouting = useRef(false);
    const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
    const [planConfirmation, setPlanConfirmation] = useState<string | null>(null);

    // Sync sessionRouting when defaultPostRouting prop changes (unless user manually overrode)
    useEffect(() => {
        if (!hasManuallySetRouting.current && defaultPostRouting) {
            setSessionRouting(defaultPostRouting);
        }
    }, [defaultPostRouting]);

    const session = useMirrorSession({ uid, isOpen, authUser, locale, initialContext, sessionRouting, onClose });
    const { messages, setMessages, isLoading, setIsLoading, isSessionLimited } = session;

    // Prevent background scrolling when chamber is active (no body jump)
    useEffect(() => {
        if (isOpen) {
            const scrollY = window.scrollY;
            document.body.style.position = 'fixed';
            document.body.style.top = `-${scrollY}px`;
            document.body.style.width = '100%';
        } else {
            const scrollY = Math.abs(parseInt(document.body.style.top || '0', 10));
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            window.scrollTo(0, scrollY);
        }
        return () => {
            const scrollY = Math.abs(parseInt(document.body.style.top || '0', 10));
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            window.scrollTo(0, scrollY);
        };
    }, [isOpen]);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { keyboardOffset, viewportTop } = useVisualViewport(isOpen);

    // ═══ CHARACTER VOICE (TTS) ═══
    const voiceId = profile?.voice?.id || null;
    const tts = useCharacterTTS({ isOpen, authUser, voiceId, messages, isLoading });

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        autoResizeTextarea(e.target);
    };

    const autoResizeTextarea = (el: HTMLTextAreaElement) => {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    };

    const handleSubmit = async () => {
        if (!input.trim() || isLoading || isSessionLimited) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: input.trim()
        };

        const newMessages = [...messages, userMessage];
        const isFirstMessage = messages.length === 0;

        if (isFirstMessage && !session.creditConsumed && !(await session.consumeSession())) return;

        await tts.prepareAudioForReply();

        // Optimistic update
        setMessages(newMessages);
        setInput("");
        setIsLoading(true);

        tts.expectVoiceReply();

        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        try {
            await session.requestReply(newMessages);
        } catch (err) {
            console.error("Failed to send message to mirror:", err);
            setIsLoading(false);
        }
    };

    // Character name: user-chosen or AI-generated name is primary; archetype roles are subtitle
    const characterName = profile?.name || null;
    const characterArchetype = profile?.defining_words?.join(', ') || null;
    const displayName = characterName || characterArchetype || "Your Ideal Self";
    const avatarUrl = profile?.avatar?.url;

    const handleExtractDirectives = async () => {
        if (isGeneratingPlan || messages.length < 2) return;
        setIsGeneratingPlan(true);
        setPlanConfirmation(null);

        try {
            const { data } = await mirrorPlan({
                messages,
                localTime: mirrorLocalTime(),
                locale,
            });
            if (data.success && data.directives?.length > 0) {
                const planMessage = `Here's your plan — ${data.directives.length} directive${data.directives.length !== 1 ? 's' : ''} set:\n\n${data.directives.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n')}\n\nThese are now saved to your directives. Go make it happen.`;
                setMessages(prev => [...prev, { id: `plan-${Date.now()}`, role: 'assistant' as const, content: planMessage }]);
                setPlanConfirmation('✓ Directives saved');
                setTimeout(() => setPlanConfirmation(null), 3000);
            } else {
                setPlanConfirmation(t('mirrorChat.directivesFailed'));
                setTimeout(() => setPlanConfirmation(null), 4000);
            }
        } catch (err) {
            console.error('Failed to extract directives:', err);
            setPlanConfirmation(t('mirrorChat.directivesFailed'));
            setTimeout(() => setPlanConfirmation(null), 4000);
        } finally {
            setIsGeneratingPlan(false);
        }
    };

    const handleSelectRouting = (option: SessionRouting) => {
        setSessionRouting(option);
        hasManuallySetRouting.current = true;
        setIsRoutingOpen(false);
        updateCharacterProfile(uid, { default_post_routing: option }).catch(() => {});
    };

    const handleClose = async () => {
        // Stop TTS audio IMMEDIATELY — before any async work
        tts.cleanupAudio();

        if (session.sessionId) {
            if (sessionRouting === 'burn') {
                await session.burnSession();
            } else {
                session.persistClose();
            }
        }

        // Wipe local state
        const finalMessages = [...messages];
        session.resetSession();
        setInput("");
        setIsRoutingOpen(false);
        setSessionRouting(defaultPostRouting || 'public');
        hasManuallySetRouting.current = false;
        setPlanConfirmation(null);

        unsuppressAutoPlay();

        // Trigger a delayed feed refresh so the new post appears without waiting for 15-min poll.
        // processChat Cloud Function needs a few seconds to create the post.
        if (sessionRouting !== 'burn' && finalMessages.filter(m => m.role === 'user').length > 0) {
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('ledger-refresh'));
            }, 8000);
        }

        onClose();
    };

    const { shouldHoldLastMessage, lastMsg } = tts;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed left-0 right-0 z-50 bg-zinc-950"
                    style={{
                        top: viewportTop,
                        bottom: keyboardOffset,
                    }}
                >
                    {/* ═══ ZONE 1: HEADER — always pinned to top ═══ */}
                    <MirrorHeader
                        headerRef={headerRef}
                        displayName={displayName}
                        characterName={characterName}
                        characterArchetype={characterArchetype}
                        avatarUrl={avatarUrl}
                        showExchangeCount={messages.length > 0}
                        exchangeCount={session.exchangeCount}
                        hasVoice={!!voiceId}
                        autoSpeak={tts.autoSpeak}
                        isSpeaking={tts.isSpeaking}
                        onToggleAutoSpeak={tts.toggleAutoSpeak}
                        onClose={handleClose}
                    />

                    {/* ═══ ZONE 2: MESSAGES — fills space between header and input ═══ */}
                    <div
                        className="absolute left-0 right-0 overflow-y-auto bg-zinc-950 custom-scrollbar"
                        style={{
                            top: headerHeight,
                            bottom: inputZoneHeight,
                        }}
                    >
                        <MirrorMessageList
                            messages={messages}
                            hiddenMessageId={shouldHoldLastMessage ? lastMsg.id : null}
                            showTypingIndicator={isLoading || shouldHoldLastMessage}
                            hasVoice={!!voiceId}
                            isLoadingTTS={tts.isLoadingTTS}
                            isSpeaking={tts.isSpeaking}
                            onPlayPause={tts.handlePlayPause}
                            canExtractDirectives={!isLoading && !shouldHoldLastMessage}
                            isGeneratingPlan={isGeneratingPlan}
                            onExtractDirectives={handleExtractDirectives}
                        />
                    </div>

                    {/* ═══ ZONE 3: INPUT — pinned above keyboard ═══ */}
                    <div
                        ref={inputZoneRef}
                        className="absolute left-0 right-0 bottom-0 bg-zinc-950 border-t border-zinc-800/50"
                    >
                        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 relative">
                            {/* Regenerate Button */}
                            {!isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2">
                                    <button
                                        onClick={session.reload}
                                        className="text-xs bg-zinc-800 text-zinc-400 px-3 py-1.5 rounded-full flex items-center gap-2 hover:text-white hover:bg-zinc-700 transition-colors shadow-lg border border-zinc-700/50"
                                    >
                                        <RefreshCcw className="w-3 h-3" />
                                        {t('mirrorChat.regenerate')}
                                    </button>
                                </div>
                            )}

                            {/* Plan Confirmation Toast */}
                            <AnimatePresence>
                                {planConfirmation && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 8 }}
                                        className="absolute -top-12 left-1/2 -translate-x-1/2 text-xs bg-zinc-800 text-zinc-200 px-4 py-1.5 rounded-full border border-zinc-700 shadow-lg whitespace-nowrap"
                                    >
                                        {planConfirmation}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* ═══ ROUTING LABEL + SETTINGS ═══ */}
                            <RoutingMenu
                                routing={sessionRouting}
                                isOpen={isRoutingOpen}
                                setIsOpen={setIsRoutingOpen}
                                onSelect={handleSelectRouting}
                            />

                            {/* Photo preview */}
                            {session.postPhotoUrl && (
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/10 shrink-0">
                                        <img src={session.postPhotoUrl} alt="" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-[10px] text-zinc-600 flex-1">Post photo attached</span>
                                    <button
                                        onClick={session.removePhoto}
                                        className="w-5 h-5 flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors"
                                        aria-label={t('mirrorChat.removePhoto')}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            )}

                            {/* Session limit reached */}
                            {isSessionLimited && (
                                <div className="bg-zinc-900/60 border border-amber-900/30 rounded-xl p-4 mb-3 flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-semibold text-white mb-1">
                                            {session.isAtExchangeLimit ? t('mirrorChat.sessionComplete') : t('mirrorChat.sessionExpired')}
                                        </p>
                                        <p className="text-xs text-zinc-400">
                                            {session.isAtExchangeLimit
                                                ? t('mirrorChat.sessionCompleteDesc', { max: MAX_EXCHANGES })
                                                : t('mirrorChat.sessionExpiredDesc', { hours: MAX_SESSION_HOURS })
                                            }
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Textarea + inline send button */}
                            <MirrorInputBar
                                textareaRef={textareaRef}
                                input={input}
                                onInputChange={handleInputChange}
                                onSubmit={handleSubmit}
                                onStop={session.stop}
                                isLoading={isLoading}
                                isSessionLimited={isSessionLimited}
                            />
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
