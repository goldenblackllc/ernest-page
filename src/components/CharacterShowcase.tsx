"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { subscribeToCharacterProfile, updateCharacterProfile } from "@/lib/firebase/character";
import { CharacterBible, CharacterProfile } from "@/types/character";
import { cn } from "@/lib/utils";
import { User, Scroll, Target, Crown, Sparkles, MessageCircle, Save, Loader2, CheckCircle2, Circle, Trash2, ChevronDown, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { CharacterSheetModal } from "./CharacterSheetModal";
import { MirrorChat } from "./MirrorChat";
import { parseMarkdownToSections } from "@/lib/utils/parseContent";

export function CharacterShowcase() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const [bible, setBible] = useState<CharacterBible | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [isMirrorOpen, setIsMirrorOpen] = useState(false);
    const [expandedSection, setExpandedSection] = useState<number | null>(null);
    const [expandedNestedSection, setExpandedNestedSection] = useState<number | null>(null);
    const [myStory, setMyStory] = useState("");
    const [isSavingStory, setIsSavingStory] = useState(false);
    const [storyLoaded, setStoryLoaded] = useState(false);

    useEffect(() => {
        if (!user) return;
        setLoading(true);

        // Real-time subscription
        const unsubscribe = subscribeToCharacterProfile(user.uid, (data) => {
            setProfile(data);
            setBible(data.character_bible);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        if (profile && !storyLoaded) {
            setMyStory(profile.my_story || "");
            setStoryLoaded(true);
        }
    }, [profile, storyLoaded]);

    const handleSaveStory = async () => {
        if (!user) return;
        setIsSavingStory(true);
        try {
            await updateCharacterProfile(user.uid, { my_story: myStory });
        } catch (error) {
            console.error("Failed to save story:", error);
            alert("Failed to save story.");
        } finally {
            setIsSavingStory(false);
        }
    };

    const handleToggleTodo = async (todoId: string, currentCompleted: boolean) => {
        if (!user || !profile?.active_todos) return;

        const updatedTodos = profile.active_todos.map(todo => {
            if (typeof todo === 'string') {
                return todo === todoId ? { id: todo, task: todo, completed: !currentCompleted, created_at: new Date() } : todo;
            }
            return todo.id === todoId ? { ...todo, completed: !currentCompleted } : todo;
        });

        try {
            await updateCharacterProfile(user.uid, {
                active_todos: updatedTodos
            });
        } catch (error) {
            console.error("Failed to toggle directive:", error);
        }
    };

    const handleDeleteTodo = async (todoId: string) => {
        if (!user || !profile?.active_todos) return;

        const updatedTodos = profile.active_todos.filter(todo => {
            const id = typeof todo === 'string' ? todo : todo.id;
            return id !== todoId;
        });

        try {
            await updateCharacterProfile(user.uid, {
                active_todos: updatedTodos
            });
        } catch (error) {
            console.error("Failed to delete directive:", error);
        }
    };

    if (loading) return <div className="h-48 w-full animate-pulse bg-zinc-900/50 rounded-xl mb-6" />;
    if (!bible) return null;

    // Helper to get background image style if available for a label
    const getVisual = (label: string) => {
        const visual = bible.compiled_bible?.visual_board?.find((v: any) => v.label.toLowerCase().includes(label.toLowerCase()));
        return visual ? { backgroundImage: `url(${visual.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {};
    };

    const displaySections = bible.compiled_output?.ideal;

    return (
        <>
            <div className="w-full mb-8 space-y-6">
                {/* HEAD PROFILE & EDIT BUTTON */}
                <div className="flex items-center justify-between pb-6 border-b border-white/5">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-zinc-800 border-2 border-zinc-700 overflow-hidden shrink-0">
                            {bible.compiled_bible?.avatar_url ? (
                                <img src={bible.compiled_bible.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-500">
                                    <User className="w-6 h-6" />
                                </div>
                            )}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white mb-0.5 capitalize">
                                {bible.source_code?.archetype || "Unknown Character"}
                            </h2>
                            <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">
                                Profile
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsSheetOpen(true)}
                        className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-bold px-4 py-2 rounded-full flex items-center gap-2 transition-all shadow-sm"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit Profile
                    </button>
                </div>

                {/* ACCORDION VAULT */}
                <div className="space-y-3">
                    {displaySections?.map((section: any, i: number) => {
                        const isOpen = expandedSection === i;

                        return (
                            <div
                                key={i}
                                className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden transition-all duration-200"
                            >
                                <button
                                    onClick={() => {
                                        setExpandedSection(isOpen ? null : i);
                                        setExpandedNestedSection(null);
                                    }}
                                    className="w-full flex items-center justify-between p-4 text-left focus:outline-none hover:bg-zinc-900/80 transition-colors"
                                >
                                    <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">
                                        {section.heading}
                                    </h3>
                                    <ChevronDown
                                        className={cn(
                                            "w-5 h-5 text-zinc-500 transition-transform duration-200",
                                            isOpen && "rotate-180 text-emerald-500"
                                        )}
                                    />
                                </button>

                                {isOpen && (
                                    <div className="p-4 border-t border-zinc-800/50 bg-zinc-950/50 space-y-2">
                                        {parseMarkdownToSections(section.content).map((subSection, j) => {
                                            const isNestedOpen = expandedNestedSection === j;
                                            return (
                                                <div key={j} className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg overflow-hidden transition-all duration-200">
                                                    <button
                                                        onClick={() => setExpandedNestedSection(isNestedOpen ? null : j)}
                                                        className="w-full flex items-center justify-between p-3 text-left focus:outline-none hover:bg-zinc-800/50 transition-colors"
                                                    >
                                                        <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                                                            {subSection.subHeading}
                                                        </h4>
                                                        <ChevronDown
                                                            className={cn(
                                                                "w-4 h-4 text-zinc-500 transition-transform duration-200",
                                                                isNestedOpen && "rotate-180 text-emerald-500"
                                                            )}
                                                        />
                                                    </button>
                                                    {isNestedOpen && (
                                                        <div className="p-4 border-t border-zinc-700/50 bg-black/20">
                                                            <div className="text-sm text-zinc-300 leading-relaxed prose prose-invert prose-sm max-w-none prose-a:text-emerald-400 prose-strong:text-emerald-300">
                                                                <ReactMarkdown>
                                                                    {subSection.body}
                                                                </ReactMarkdown>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div >

            <CharacterSheetModal
                isOpen={isSheetOpen}
                onClose={() => setIsSheetOpen(false)}
                initialData={bible}
            />
        </>
    );
}
