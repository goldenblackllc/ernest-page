"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth/AuthContext";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { Timestamp, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { FeedPostCard } from "@/components/FeedPostCard";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { DashboardHeader } from "@/components/DashboardHeader";
import { TriagePanel } from "@/components/TriagePanel";

export default function SavedPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [posts, setPosts] = useState<any[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [postToDelete, setPostToDelete] = useState<string | null>(null);

    const handleConfirmDelete = async () => {
        if (!postToDelete) return;
        try {
            await deleteDoc(doc(db, "posts", postToDelete));
            setPosts(prev => prev.filter(p => p.id !== postToDelete));
        } catch (error) {
            console.error("Error deleting post:", error);
        }
        setPostToDelete(null);
    };

    const fetchSaved = useCallback(async () => {
        if (!user) return;
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/posts/saved', {
                headers: { 'Authorization': `Bearer ${idToken}` },
            });
            if (!res.ok) throw new Error('Failed to fetch saved posts');
            const data = await res.json();
            const mapped = (data.posts || []).map((post: any) => {
                if (post.created_at && post.created_at._seconds !== undefined) {
                    post.created_at = new Timestamp(post.created_at._seconds, post.created_at._nanoseconds || 0);
                }
                return post;
            });
            setPosts(mapped);
        } catch (err) {
            console.error('Failed to fetch saved posts:', err);
        } finally {
            setLoadingPosts(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) fetchSaved();
    }, [user, fetchSaved]);

    if (loading) {
        return (
            <main className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-[10px] uppercase tracking-widest text-zinc-600 animate-pulse">Loading...</div>
            </main>
        );
    }

    if (!user) {
        router.push('/');
        return null;
    }

    return (
        <main className="min-h-screen text-zinc-300 font-sans">
            <DashboardHeader />

            <div className="container mx-auto px-0 sm:px-4 pt-[calc(64px+env(safe-area-inset-top))] pb-32 max-w-3xl">
                <div className="px-4 sm:px-0 mb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <Heart className="w-5 h-5 text-zinc-500" />
                        <h1 className="text-2xl font-bold text-white tracking-tight">Liked</h1>
                    </div>
                    <p className="text-sm text-zinc-500">Posts you've shown love to.</p>
                </div>

                {loadingPosts ? (
                    <div className="space-y-4">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 animate-pulse">
                                <div className="h-4 bg-zinc-800 rounded w-3/4 mb-3" />
                                <div className="h-3 bg-zinc-800 rounded w-1/2" />
                            </div>
                        ))}
                    </div>
                ) : posts.length === 0 ? (
                    <div className="p-12 text-center border border-zinc-800 border-dashed rounded-xl bg-transparent">
                        <Heart className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                        <p className="text-sm text-zinc-500">No liked posts yet. Tap the heart on any post to save it here.</p>
                    </div>
                ) : (
                    <section className="flex flex-col gap-6">
                        {posts.map((post: any) => (
                            <FeedPostCard key={post.id} post={post} onRequestDelete={setPostToDelete} />
                        ))}
                    </section>
                )}
            </div>

            <TriagePanel />

            <DeleteConfirmationModal
                isOpen={postToDelete !== null}
                onClose={() => setPostToDelete(null)}
                onConfirm={handleConfirmDelete}
            />
        </main>
    );
}
