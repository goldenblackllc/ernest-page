import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/config";
import { Camera, Loader2, Type, ArrowRight } from "lucide-react";

interface ActionEntry {
    id: string;
    title: string;
    status: string;
    startedAt: any;
}

export function FocusReportForm({ action, onSuccess }: { action: ActionEntry, onSuccess?: (next?: boolean) => void }) {
    const router = useRouter();
    const [headline, setHeadline] = useState(action.title || "");
    const [story, setStory] = useState("");
    const [unexpected, setUnexpected] = useState("");
    const [mood, setMood] = useState("");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submittingAction, setSubmittingAction] = useState<"publish" | "next" | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Title Case Helper
    const toTitleCase = (str: string) => {
        return str.replace(
            /\w\S*/g,
            function (txt) {
                return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
            }
        );
    };

    const handleTitleCase = () => {
        setHeadline(toTitleCase(headline));
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (next: boolean) => {
        if (!headline.trim()) return;
        setIsSubmitting(true);
        setSubmittingAction(next ? "next" : "publish");

        try {
            let imageUrl = null;

            // Upload image if selected
            if (imageFile) {
                const storageRef = ref(storage, `entries/${action.id}/${imageFile.name}`);
                await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(storageRef);
            }

            // Update Firestore document
            await updateDoc(doc(db, "entries", action.id), {
                headline: headline.trim(), // Mixed case allowed
                story: story.trim(),
                unexpected: unexpected.trim(),
                mood: mood.trim(), // Mixed case allowed
                imageUrl,
                status: "completed",
                completedAt: serverTimestamp(),
            });

            if (onSuccess) {
                onSuccess(next);
            } else {
                router.push("/");
            }
        } catch (error: any) {
            console.error("Error submitting report:", error);
            alert(`Error: ${error.message}`);
            setIsSubmitting(false);
            setSubmittingAction(null);
        }
    };

    return (
        <div className="w-full bg-white text-black">
            <div className="mb-8">
                <h2 className="text-[1.395rem] md:text-[2.7rem] font-bold leading-[1.1] text-gray-900 mb-2">
                    What Happened?
                </h2>
                <p className="text-[0.75rem] uppercase tracking-[0.1em] font-bold text-[#868e96] mb-8">
                    REFLECTING ON: {action.title}
                </p>
            </div>

            <div className="space-y-6">
                {/* 1. Headline Input with Title Case Helper */}
                <div className="mb-4">
                    <label className="block text-xs font-bold tracking-widest uppercase text-gray-800 mb-2">
                        HEADLINE
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={headline}
                            onChange={(e) => setHeadline(e.target.value)}
                            maxLength={80}
                            placeholder="What happened?"
                            className="form-control pr-10"
                            required
                        />
                        <button
                            type="button"
                            onClick={handleTitleCase}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors"
                            title="Convert to Title Case"
                        >
                            <Type className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* 2. The Story (New Field) */}
                <div className="mb-4">
                    <label className="block text-xs font-bold tracking-widest uppercase text-gray-800 mb-2">
                        SUMMARY
                    </label>
                    <textarea
                        value={story}
                        onChange={(e) => setStory(e.target.value)}
                        placeholder="What happened? Tell the story..."
                        className="form-control h-32 resize-y"
                    />
                </div>

                {/* 3. Mood Input */}
                <div className="mb-4">
                    <label className="block text-xs font-bold tracking-widest uppercase text-gray-800 mb-2">
                        HOW DO YOU FEEL?
                    </label>
                    <input
                        type="text"
                        value={mood}
                        onChange={(e) => setMood(e.target.value)}
                        maxLength={16}
                        placeholder="Describe your state..."
                        className="form-control"
                    />
                </div>

                {/* 4. Unexpected Outcome */}
                <div className="mb-4">
                    <label className="block text-xs font-bold tracking-widest uppercase text-gray-800 mb-2">
                        UNEXPECTED OUTCOME
                    </label>
                    <textarea
                        value={unexpected}
                        onChange={(e) => setUnexpected(e.target.value)}
                        placeholder="Did anything unexpected happen?"
                        className="form-control h-24 resize-none"
                    />
                </div>

                {/* 5. Photo Upload - Compact */}
                <div className="mb-6 pt-2">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="btn btn-secondary btn-sm w-auto px-4 py-2 border-2 border-black flex items-center gap-2"
                        >
                            <Camera className="w-4 h-4" />
                            {imagePreview ? "CHANGE PHOTO" : "OPTIONAL PHOTO"}
                        </button>
                        {imagePreview && (
                            <div className="relative w-12 h-12 border border-gray-300 overflow-hidden">
                                <img
                                    src={imagePreview}
                                    alt="Preview"
                                    className="w-full h-full object-cover grayscale"
                                />
                            </div>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="hidden"
                        />
                    </div>
                </div>

                {/* 6. Action Buttons */}
                <div className="grid grid-cols-2 gap-4 pt-4">
                    {/* Button 1: Publish (Secondary) */}
                    <button
                        type="button"
                        onClick={() => handleSubmit(false)}
                        disabled={isSubmitting}
                        className="btn btn-secondary"
                    >
                        {isSubmitting && submittingAction === "publish" ? (
                            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                        ) : (
                            "PUBLISH"
                        )}
                    </button>

                    {/* Button 2: Publish & Next (Primary) */}
                    <button
                        type="button"
                        onClick={() => handleSubmit(true)}
                        disabled={isSubmitting}
                        className="btn btn-primary flex items-center justify-center gap-2"
                    >
                        {isSubmitting && submittingAction === "next" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                PUBLISH & NEXT
                                <ArrowRight className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
