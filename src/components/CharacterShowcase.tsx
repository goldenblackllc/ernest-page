"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { subscribeToCharacterProfile, updateCharacterProfile } from "@/lib/firebase/character";
import { CharacterBible, CharacterProfile } from "@/types/character";
import { cn } from "@/lib/utils";
import { User, Scroll, Target, Crown, Sparkles, MessageCircle, Save, Loader2, CheckCircle2, Circle, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { CharacterSheetModal } from "./CharacterSheetModal";
import { MirrorChat } from "./MirrorChat";

export function CharacterShowcase() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<CharacterProfile | null>(null);
    const [bible, setBible] = useState<CharacterBible | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [isMirrorOpen, setIsMirrorOpen] = useState(false);
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
            <div className="w-full mb-8 space-y-4">
                <div className="flex items-center justify-between px-1">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Crown className="w-5 h-5 text-emerald-500" />
                        Desired Character
                    </h2>
                </div>

                {/* Carousel Container */}
                <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory no-scrollbar text-white">

                    {/* CARD 1: IDENTITY (The "Profile" Card) */}
                    <button
                        onClick={() => setIsSheetOpen(true)}
                        className="snap-center shrink-0 w-[85vw] sm:w-80 h-96 rounded-2xl bg-zinc-900 border border-zinc-800 p-6 flex flex-col justify-between relative overflow-hidden group transition-all hover:border-zinc-500 text-left"
                        style={getVisual('identity')}
                    >
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

                        <div className="relative z-10">
                            <div className="w-12 h-12 rounded-full bg-zinc-800 border-2 border-zinc-700 mb-4 overflow-hidden">
                                {bible.compiled_bible?.avatar_url ? (
                                    <img src={bible.compiled_bible.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-zinc-500">
                                        <User className="w-6 h-6" />
                                    </div>
                                )}
                            </div>
                            <h3 className="text-2xl font-black uppercase tracking-tighter text-white leading-none mb-2">
                                {bible.source_code?.archetype || "Unknown"}
                            </h3>
                            <p className="text-sm text-zinc-300 leading-relaxed opacity-90">
                                {bible.source_code?.manifesto || "No manifesto."}
                            </p>
                        </div>

                        <div className="relative z-10 pt-4 border-t border-white/10">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Archetype</div>
                            <div className="text-xs font-bold text-emerald-400">ACTIVE PROTAGONIST</div>
                        </div>
                    </button>

                    {/* DYNAMIC CARDS FROM COMPILED OUTPUT */}
                    {displaySections?.map((section, i) => (
                        <button
                            key={i}
                            onClick={() => setIsSheetOpen(true)}
                            className="snap-center shrink-0 w-[85vw] sm:w-80 h-96 rounded-2xl bg-zinc-950 border border-zinc-800 p-6 flex flex-col relative overflow-hidden group text-left hover:border-zinc-500 transition-colors"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Sparkles className="w-24 h-24 text-white" />
                            </div>

                            <div className="mb-6 relative z-10">
                                <h3 className="text-lg font-black uppercase tracking-widest text-zinc-500 mb-1">{section.heading}</h3>
                                <div className="h-1 w-12 bg-zinc-700 group-hover:bg-zinc-500 transition-colors rounded-full" />
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-3 relative z-10 pr-2 custom-scrollbar">
                                <div className="text-sm text-zinc-300 leading-relaxed prose prose-invert prose-sm max-w-none prose-headings:font-bold prose-headings:text-white prose-a:text-emerald-400 prose-strong:text-emerald-300">
                                    <ReactMarkdown>
                                        {section.content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </button>
                    ))}

                </div>

                {/* MY STORY SECTION - Temporarily hidden */}
                {false && (
                    <div className="mt-8 px-1">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">My Story (Current Reality)</h2>
                            <button
                                onClick={handleSaveStory}
                                disabled={isSavingStory || myStory === profile?.my_story}
                                className={cn(
                                    "flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full transition-all",
                                    myStory !== profile?.my_story
                                        ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                        : "bg-zinc-800 text-zinc-500 cursor-default"
                                )}
                            >
                                {isSavingStory ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                Save Story
                            </button>
                        </div>
                        <textarea
                            value={myStory}
                            onChange={(e) => setMyStory(e.target.value)}
                            placeholder="Describe your current life as you see it. Your past, your future desires, your physical/financial constraints, and ongoing situations. (e.g., 'I live in Carlisle, my daughter is in the hospital, I am an entrepreneur...')."
                            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 text-zinc-300 text-sm leading-relaxed focus:border-zinc-500 focus:outline-none min-h-[120px] resize-none"
                        />
                    </div>
                )}

                {/* ACTIVE DIRECTIVES SECTION */}
                <div className="mt-8 px-1 mb-6">
                    <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Active Directives</h2>
                    <div className="space-y-3">
                        {!profile?.active_todos || profile.active_todos.length === 0 ? (
                            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6 text-center">
                                <p className="text-zinc-500 text-sm">No active directives. Complete a Check-In to get your next steps.</p>
                            </div>
                        ) : (
                            profile.active_todos.map((todo) => {
                                const isString = typeof todo === 'string';
                                const id = isString ? todo : todo.id;
                                const task = isString ? todo : todo.task;
                                const completed = isString ? false : todo.completed;

                                return (
                                    <div
                                        key={id}
                                        className="flex items-start justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 transition-colors hover:border-zinc-700 group"
                                    >
                                        <div
                                            className="flex items-start gap-3 flex-1 cursor-pointer"
                                            onClick={() => handleToggleTodo(id, completed)}
                                        >
                                            <button className="mt-0.5 shrink-0 text-zinc-500 hover:text-emerald-400 transition-colors">
                                                {completed ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5" />}
                                            </button>
                                            <p className={cn(
                                                "text-sm leading-relaxed",
                                                completed ? "text-zinc-500 line-through" : "text-zinc-300"
                                            )}>
                                                {task}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteTodo(id)}
                                            className="mt-0.5 shrink-0 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                            title="Delete directive"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Mirror Chat Entry Button */}
                <div className="mt-6 px-1">
                    <button
                        onClick={() => setIsMirrorOpen(true)}
                        className="w-full relative group overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 p-4 transition-all hover:border-emerald-500/50"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <div className="relative flex items-center justify-between z-10">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform duration-300">
                                    <MessageCircle className="w-6 h-6" />
                                </div>
                                <div className="text-left">
                                    <h3 className="text-white font-bold leading-none mb-1 group-hover:text-emerald-400 transition-colors">Consult Your Ideal Self</h3>
                                    <p className="text-sm text-zinc-400 font-medium">Real-time guidance from the Mirror.</p>
                                </div>
                            </div>
                            <Sparkles className="w-5 h-5 text-emerald-500/50 group-hover:text-emerald-400 group-hover:rotate-12 transition-all duration-300 mr-2" />
                        </div>
                    </button>
                </div>
            </div >

            <CharacterSheetModal
                isOpen={isSheetOpen}
                onClose={() => {
                    setIsSheetOpen(false);
                }}
                initialData={bible}
            />

            <MirrorChat
                isOpen={isMirrorOpen}
                onClose={() => setIsMirrorOpen(false)}
                bible={bible}
                uid={user?.uid || ""}
            />
        </>
    );
}
