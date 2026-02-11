"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import Image from "next/image";
import { Search, User, ShoppingCart } from "lucide-react";
import { ControlDeck } from "@/components/ControlDeck";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import { IdentityModal } from "@/components/IdentityModal";
import { ActionSelectionModal } from "@/components/ActionSelectionModal";
import { ReportCompletionModal } from "@/components/ReportCompletionModal";
import { useAuth } from "@/lib/auth/AuthContext";

import { collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp } from "firebase/firestore";

// Replicating the Sell Template Header Structure locally for the dashboard to match "exactly"
// Based on the user's screenshot: Clean white header, "SELL." logo, Hamburger Menu.
function DashboardHeader() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const router = useRouter();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push('/login');
        } catch (error) {
            console.error("Error signing out: ", error);
        }
    };

    return (
        <header className="sticky top-0 z-50 bg-white">
            {/* Navbar */}
            <nav className="py-6 px-4 border-b border-gray-100 relative">
                <div className="container mx-auto flex justify-between items-center">
                    {/* Brand - Sans Serif Bold like specific template screenshot */}
                    <Link href="/" className="text-xl font-bold tracking-widest uppercase flex items-center gap-1 hover:opacity-80 transition-opacity text-gray-900">
                        Earnest Page
                    </Link>

                    {/* Hamburger / Menu */}
                    <div className="relative">
                        <button
                            className="p-2 hover:bg-gray-100 rounded-sm"
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                        >
                            <div className="space-y-1.5">
                                <span className="block w-6 h-0.5 bg-gray-800"></span>
                                <span className="block w-6 h-0.5 bg-gray-800"></span>
                                <span className="block w-6 h-0.5 bg-gray-800"></span>
                            </div>
                        </button>

                        {/* Dropdown Menu */}
                        {isMenuOpen && (
                            <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 shadow-lg z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                <ul className="py-2">
                                    <li className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-2">
                                        Menu
                                    </li>
                                    <li>
                                        <button
                                            onClick={handleLogout}
                                            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-bold uppercase tracking-widest transition-colors"
                                        >
                                            Logout
                                        </button>
                                    </li>
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            </nav>
        </header>
    );
}

function DashboardFooter() {
    return (
        <footer className="border-t border-gray-200">
            {/* Services Block - High Contrast Inverse (Template has this) */}
            <div className="bg-gray-900 text-white py-12">
                <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
                    <div>
                        <h6 className="font-bold uppercase tracking-widest mb-2 text-sm">Free shipping & return</h6>
                        <p className="text-sm opacity-60">Free Shipping over $300</p>
                    </div>
                    <div>
                        <h6 className="font-bold uppercase tracking-widest mb-2 text-sm">Money back guarantee</h6>
                        <p className="text-sm opacity-60">30 Days Money Back Guarantee</p>
                    </div>
                    <div>
                        <h6 className="font-bold uppercase tracking-widest mb-2 text-sm">020-800-456-747</h6>
                        <p className="text-sm opacity-60">24/7 Available Support</p>
                    </div>
                </div>
            </div>

            {/* Main Links Block */}
            <div className="bg-white text-gray-900 py-16">
                <div className="container mx-auto px-4 grid grid-cols-1 lg:grid-cols-4 gap-12">
                    <div className="lg:col-span-1">
                        <div className="text-xl font-bold uppercase mb-4">Earnest Page</div>
                        <p className="text-sm mb-4 text-gray-500">Lorem ipsum dolor sit amet, consectetur adipisicing.</p>
                        <div className="flex gap-4 opacity-50">
                            {/* Social placeholders */}
                            <span>🐦</span><span>📘</span><span>📷</span><span>📌</span><span>🎥</span>
                        </div>
                    </div>

                    <div>
                        <h6 className="font-bold uppercase tracking-widest mb-6 text-sm">Shop</h6>
                        <ul className="text-sm space-y-2 text-gray-500">
                            <li><a href="#" className="hover:text-blue-600">For Women</a></li>
                            <li><a href="#" className="hover:text-blue-600">For Men</a></li>
                            <li><a href="#" className="hover:text-blue-600">Stores</a></li>
                            <li><a href="#" className="hover:text-blue-600">Our Blog</a></li>
                            <li><a href="#" className="hover:text-blue-600">Shop</a></li>
                        </ul>
                    </div>

                    <div>
                        <h6 className="font-bold uppercase tracking-widest mb-6 text-sm">Company</h6>
                        <ul className="text-sm space-y-2 text-gray-500">
                            <li><a href="#" className="hover:text-blue-600">Login</a></li>
                            <li><a href="#" className="hover:text-blue-600">Register</a></li>
                            <li><a href="#" className="hover:text-blue-600">Wishlist</a></li>
                            <li><a href="#" className="hover:text-blue-600">Our Products</a></li>
                            <li><a href="#" className="hover:text-blue-600">Checkouts</a></li>
                        </ul>
                    </div>

                    <div>
                        <h6 className="font-bold uppercase tracking-widest mb-6 text-sm">Daily Offers & Discounts</h6>
                        <p className="text-sm mb-4 text-gray-500">Lorem ipsum dolor sit amet, consectetur adipisicing elit. At itaque temporibus.</p>
                        <form className="flex border border-gray-300">
                            <input type="email" placeholder="Your Email Address" className="w-full p-2 bg-transparent border-none focus:ring-0 placeholder:text-gray-400 text-sm" />
                            <button className="px-4 hover:bg-gray-900 hover:text-white transition-colors text-gray-500">➤</button>
                        </form>
                    </div>
                </div>
            </div>

            {/* Copyright */}
            <div className="bg-gray-100 py-8">
                <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
                    <p>© 2020 Your company. All rights reserved.</p>
                    <div className="flex gap-4 mt-4 md:mt-0 opacity-50">
                        <span>VISA</span><span>MC</span><span>PAYPAL</span><span>WU</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}

const BLOG_POSTS = [
    {
        id: 1,
        title: "Pellentesque habitant morbi",
        category: "Fashion and style",
        date: "January 16, 2016",
        excerpt: "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante.",
        image: "/img/photo/kyle-loftus-596319-unsplash.jpg"
    },
    {
        id: 2,
        title: "Best books about Fashion",
        category: "Fashion and style",
        date: "January 16, 2016",
        excerpt: "Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Mauris placerat eleifend leo.",
        image: "/img/photo/marion-michele-330691-unsplash.jpg"
    },
    {
        id: 3,
        title: "Best books about Fashion",
        category: "Fashion and style",
        date: "January 16, 2016",
        excerpt: "Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae. Aenean ultricies mi vitae est.",
        image: "/img/photo/kyle-loftus-589739-unsplash-cropped.jpg"
    },
    {
        id: 4,
        title: "Autumn fashion tips and tricks",
        category: "Fashion and style",
        date: "January 16, 2016",
        excerpt: "Pellentesque habitant morbi tristique senectus. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Mauris placerat eleifend leo.",
        image: "/img/photo/kyle-loftus-589739-unsplash-cropped.jpg"
    },
    {
        id: 5,
        title: "Newest photo apps",
        category: "Fashion and style",
        date: "January 16, 2016",
        excerpt: "ellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante.",
        image: "/img/photo/averie-woodard-319832-unsplash.jpg"
    },
    {
        id: 6,
        title: "Best books about Photography",
        category: "Fashion and style",
        date: "January 16, 2016",
        excerpt: "Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Mauris placerat eleifend leo.",
        image: "/img/photo/alex-holyoake-571682-unsplash-cropped.jpg"
    }
];

export default function Home() {
    const { user } = useAuth();
    const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(false);
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [identityDefinition, setIdentityDefinition] = useState("");
    const [activeAction, setActiveAction] = useState<any>(null);

    useEffect(() => {
        if (!user) return;

        // Fetch Identity
        const fetchIdentity = async () => {
            try {
                const q = query(
                    collection(db, "definitions"),
                    where("userId", "==", user.uid)
                );
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    const docs = querySnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    })) as any[];
                    docs.sort((a, b) => {
                        const dateA = a.updatedAt?.toDate() || new Date(0);
                        const dateB = b.updatedAt?.toDate() || new Date(0);
                        return dateB.getTime() - dateA.getTime();
                    });
                    setIdentityDefinition(docs[0].text);
                }
            } catch (error) {
                console.error("Error fetching identity:", error);
            }
        };

        // Listen for Active Action
        const fetchActiveAction = async () => {
            try {
                const q = query(
                    collection(db, "entries"),
                    where("uid", "==", user.uid),
                    where("status", "==", "in_progress"),
                    where("type", "==", "action"),
                    orderBy("startedAt", "desc"),
                    limit(1)
                );
                // Real-time listener would be better, but simple fetch for now as requested by "Update Dashboard" logic
                // Actually, let's use onSnapshot if we want it instant, but the prompt didn't strictly require it.
                // Sticking to getDocs for consistency with existing code, but polling or trigger might be needed.
                // Since ActionSelectionModal just closes, we need to trigger an update.
                // Let's rely on a simple poll or just re-fetch when modal closes?
                // For now, simple fetch on mount.
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    setActiveAction({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
                } else {
                    setActiveAction(null);
                }
            } catch (error) {
                console.error("Error fetching active action:", error);
            }
        };

        fetchIdentity();
        fetchActiveAction();

        // Add a focus listener to re-fetch when window regains focus, helping with updates
        window.addEventListener("focus", fetchActiveAction);
        return () => window.removeEventListener("focus", fetchActiveAction);
    }, [user, isActionModalOpen, isReportModalOpen]); // Re-fetch when modals close

    const handleUpdateDefinition = async (text: string) => {
        if (!user) return;
        try {
            await addDoc(collection(db, "definitions"), {
                userId: user.uid,
                text,
                updatedAt: serverTimestamp()
            });
            setIdentityDefinition(text);
            setIsIdentityModalOpen(false);
        } catch (error) {
            console.error("Error updating identity:", error);
            throw error;
        }
    };

    return (
        <ProtectedRoute>
            <main className="min-h-screen bg-white text-gray-900 font-sans">
                <DashboardHeader />

                {/* Hero Section */}
                <section className="relative py-24 mb-12 bg-gray-50">
                    <div className="absolute inset-0 z-0">
                        <Image
                            src="/img/photo/matese-fields-233175-unsplash.jpg"
                            alt="Hero Background"
                            fill
                            className="object-cover"
                            priority
                        />
                    </div>

                    <div className="container mx-auto px-4 relative z-10 text-left">
                        <div className="grid grid-cols-1 lg:grid-cols-2">
                            <div className="max-w-lg">
                                <div className="bg-white p-12 shadow-sm border border-gray-100">
                                    {activeAction ? (
                                        <>
                                            <strong className="text-xs uppercase tracking-widest text-blue-600 mb-4 block font-bold">
                                                In Progress
                                            </strong>
                                            <h2 className="text-3xl lg:text-4xl font-bold mb-6 leading-tight text-gray-900">
                                                {activeAction.title}
                                            </h2>
                                            <p className="text-base text-gray-500 mb-8 leading-relaxed font-light">
                                                The only way out is through.
                                            </p>
                                            <button
                                                onClick={() => setIsReportModalOpen(true)}
                                                className="inline-flex items-center text-[10px] font-bold uppercase tracking-[0.2em] bg-black text-white px-6 py-3 hover:bg-gray-800 transition-colors"
                                            >
                                                Report Completion
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <strong className="text-xs uppercase tracking-widest text-gray-500 mb-4 block font-bold">
                                                Identity
                                            </strong>
                                            <h2 className="text-3xl lg:text-4xl font-bold mb-6 leading-tight text-gray-900">
                                                Your Identity
                                            </h2>
                                            <p className="text-base text-gray-500 mb-8 leading-relaxed font-light">
                                                {identityDefinition || "Define who you are to start your journey."}
                                            </p>
                                            <Link href="#" className="inline-flex items-center text-[10px] font-bold uppercase tracking-[0.2em] text-gray-900 hover:text-blue-600 transition-colors gap-3">
                                                Continue Reading <span>➝</span>
                                            </Link>
                                        </>
                                    )}
                                </div>

                                {/* Control Deck Button Row */}
                                <div className="mt-4">
                                    <ControlDeck
                                        onIdentityClick={() => setIsIdentityModalOpen(true)}
                                        onTakeActionClick={() => {
                                            if (activeAction) {
                                                alert("Address your current assignment first.");
                                            } else {
                                                setIsActionModalOpen(true);
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Content Section */}
                <section className="pb-20">
                    <div className="container mx-auto px-4">
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-8 md:gap-8">
                            {BLOG_POSTS.map((post) => (
                                <div key={post.id} className="group cursor-pointer">
                                    <div className="mb-4 relative aspect-[4/5] md:aspect-[4/3] overflow-hidden">
                                        <Image
                                            src={post.image}
                                            alt={post.title}
                                            fill
                                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                                        />
                                    </div>
                                    <div>
                                        <small className="block text-[10px] uppercase tracking-widest text-gray-400 mb-2 font-bold">{post.category}</small>
                                        <h5 className="text-lg font-bold mb-2 group-hover:text-blue-600 transition-colors leading-tight">{post.title}</h5>
                                        <p className="text-[10px] text-gray-400 mb-3 flex items-center gap-2">
                                            <span>🕒</span> {post.date}
                                        </p>
                                        <p className="text-gray-500 mb-4 h-16 overflow-hidden text-ellipsis leading-relaxed text-sm hidden md:block">
                                            {post.excerpt}
                                        </p>
                                        <Link href="#" className="inline-block text-[10px] font-bold uppercase tracking-widest border-b border-gray-200 pb-1 hover:border-blue-600 hover:text-blue-600 transition-all text-gray-900">
                                            Read more
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        <nav className="mt-16 flex justify-between border-t border-gray-200 pt-8">
                            <Link href="#" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-gray-900">
                                ← Older posts
                            </Link>
                            <span className="opacity-50 text-xs font-bold uppercase tracking-widest cursor-not-allowed text-gray-300">
                                Newer posts →
                            </span>
                        </nav>
                    </div>
                </section>

                <DashboardFooter />
                <IdentityModal
                    isOpen={isIdentityModalOpen}
                    onClose={() => setIsIdentityModalOpen(false)}
                    initialText={identityDefinition}
                    onUpdate={handleUpdateDefinition}
                />
                <ActionSelectionModal
                    isOpen={isActionModalOpen}
                    onClose={() => setIsActionModalOpen(false)}
                />
                {activeAction && (
                    <ReportCompletionModal
                        isOpen={isReportModalOpen}
                        onClose={() => setIsReportModalOpen(false)}
                        onNext={() => {
                            setIsReportModalOpen(false);
                            setActiveAction(null);
                            setIsActionModalOpen(true);
                        }}
                        action={activeAction}
                    />
                )}
            </main>
        </ProtectedRoute>
    );
}
