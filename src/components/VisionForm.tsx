import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, serverTimestamp, writeBatch, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/config";
import { useAuth } from "@/lib/auth/AuthContext";
import { StreamInput } from "./StreamInput";
import { StreamList, StreamItem } from "./StreamList";
import { Button } from "@/components/ui/Button";
import { Loader2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { cn } from "@/lib/utils";

export function VisionForm() {
    const router = useRouter();
    const { user } = useAuth();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [streamItems, setStreamItems] = useState<StreamItem[]>([]);
    const [top3Feelings, setTop3Feelings] = useState<string[]>([]); // Array of IDs
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    const handleAddStreamItem = (text: string, category: "FEELING" | "THOUGHT" | "ACTION") => {
        const newItem: StreamItem = {
            id: uuidv4(),
            text,
            category,
        };
        // Prepend new item to appear at the TOP
        setStreamItems((prev) => [newItem, ...prev]);
    };

    const handleDeleteStreamItem = (id: string) => {
        setStreamItems((prev) => prev.filter((item) => item.id !== id));
        setTop3Feelings((prev) => prev.filter((feelingId) => feelingId !== id));
    };

    const handleToggleFeeling = (id: string) => {
        setTop3Feelings((prev) => {
            if (prev.includes(id)) {
                return prev.filter((feelingId) => feelingId !== id);
            } else {
                if (prev.length >= 3) {
                    return prev; // Max 3
                }
                return [...prev, id];
            }
        });
    };

    const handlePublish = async () => {
        if (!user) {
            alert("You must be logged in to publish.");
            return;
        }

        if (!title.trim()) {
            alert("Please enter a title.");
            return;
        }

        setIsSubmitting(true);

        try {
            // 1. Upload Image if exists
            let imageUrl = null;
            const storagePathId = uuidv4();

            if (imageFile) {
                const storageRef = ref(storage, `vision/${user.uid}/${storagePathId}/${imageFile.name}`);
                await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(storageRef);
            }

            // 2. Prepare Data
            const feelings = streamItems
                .filter(item => item.category === "FEELING" && top3Feelings.includes(item.id))
                .map(item => item.text)
                .join(", ");

            const thoughts = streamItems
                .filter(item => item.category === "THOUGHT")
                .map(item => item.text)
                .join("\n"); // Joined as text

            const actions = streamItems
                .filter(item => item.category === "ACTION")
                .map(item => item.text);

            // 3. Firestore Batch
            const batch = writeBatch(db);

            // Create Entry Reference
            const entriesRef = collection(db, "entries");
            const newEntryRef = doc(entriesRef); // Auto-gen ID

            batch.set(newEntryRef, {
                userId: user.uid,
                title: title.trim(),
                description: description.trim(),
                imageUrl,
                i_feel: feelings,
                i_think: thoughts,
                i_act: actions,
                type: "vision",
                createdAt: serverTimestamp(),
            });

            // Create Master Actions
            const masterActionsRef = collection(db, "master_actions");
            actions.forEach(actionText => {
                const newActionRef = doc(masterActionsRef);
                batch.set(newActionRef, {
                    userId: user.uid,
                    title: actionText,
                    originEntryId: newEntryRef.id,
                    createdAt: serverTimestamp(),
                    status: "backlog",
                });
            });

            await batch.commit();

            router.push("/");

        } catch (error: any) {
            console.error("Error publishing vision:", error);
            alert(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto pb-20">
            {/* Hero Area */}
            <div className="mb-12">
                <div
                    className={cn(
                        "w-full h-64 md:h-80 relative mb-8 cursor-pointer group transition-all",
                        !imagePreview && "border-2 border-dashed border-gray-300 hover:border-black bg-gray-50 flex items-center justify-center",
                        imagePreview && "border border-black"
                    )}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                    />

                    {imagePreview ? (
                        <>
                            <img
                                src={imagePreview}
                                alt="Vision"
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                <span className="text-white text-sm font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 px-3 py-1">
                                    Change Image
                                </span>
                            </div>
                        </>
                    ) : (
                        <p className="text-gray-400 group-hover:text-black font-medium uppercase tracking-widest text-sm transition-colors">
                            Upload Inspiration (Optional)
                        </p>
                    )}
                </div>

                <div className="text-center space-y-4 max-w-2xl mx-auto">
                    <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-black uppercase">
                        What Do You Want?
                    </h2>
                    <p className="text-lg md:text-xl text-gray-700 leading-relaxed">
                        "The distance between where you are and what you want is determined by your frequency. Define the target. Generate the frequency."
                    </p>
                </div>
            </div>

            {/* Main Form Fields */}
            <div className="space-y-12">

                {/* Title & Description Group */}
                <div className="space-y-6">
                    <div>
                        <label className="block text-[10px] md:text-xs font-bold uppercase tracking-[0.15em] text-gray-900 mb-2">
                            TITLE
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g., A new car, $10k/month, a healthy relationship..."
                            className="w-full border border-gray-300 bg-transparent px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-0 rounded-none transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] md:text-xs font-bold uppercase tracking-[0.15em] text-gray-900 mb-2">
                            DESCRIPTION
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Describe the details of what you want..."
                            className="w-full h-32 border border-gray-300 bg-transparent px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-black focus:ring-0 rounded-none transition-colors resize-y"
                        />
                    </div>
                </div>

                {/* The Stream */}
                <section className="space-y-6">
                    <div className="border-b-2 border-black pb-2">
                        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-black uppercase">
                            The Stream
                        </h2>
                    </div>

                    <StreamInput onAdd={handleAddStreamItem} />

                    <StreamList
                        items={streamItems}
                        top3Feelings={top3Feelings}
                        onDelete={handleDeleteStreamItem}
                        onToggleFeeling={handleToggleFeeling}
                    />
                </section>

                {/* Submit Action */}
                <div className="flex justify-start">
                    <Button
                        variant="primary"
                        onClick={handlePublish}
                        disabled={isSubmitting}
                        className="w-auto inline-block px-8 py-4 text-xs tracking-[0.2em]"
                    >
                        {isSubmitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            "PUBLISH"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
