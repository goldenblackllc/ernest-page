import { db } from "@/lib/firebase/config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { Driver, Vision } from "@/types/recast";

export interface CreatePostParams {
    content: string;
    content_raw?: string; // Original input (rant)
    authorId: string;
    authorName?: string;
    characterId?: string;
    constraints?: string[]; // e.g. ["recast"]
    tags?: string[];
    type?: 'text' | 'recast' | 'recast_event';
    // Optional structured data for extended display
    rant?: string;
    core_beliefs?: string[] | Driver[]; // Relaxed to support both
    vision?: Vision[];
}

export async function createPost(params: CreatePostParams) {
    if (!params.authorId) throw new Error("User ID is required");

    // Format for Feed Display
    const postData = {
        uid: params.authorId,
        author: params.authorName || "Anonymous",
        characterId: params.characterId || "system",
        type: params.type || 'text',
        content: params.content,
        content_raw: params.content_raw, // Save raw input

        // Metadata
        constraints: params.constraints || [],
        tags: params.tags || [],

        // Legacy / Extended
        rant: params.rant,
        core_beliefs: params.core_beliefs,
        vision: params.vision,

        created_at: serverTimestamp(),
        likes: 0,
        comments: 0
    };

    // Remove undefined keys
    Object.keys(postData).forEach(key => postData[key as keyof typeof postData] === undefined && delete postData[key as keyof typeof postData]);

    const docRef = await addDoc(collection(db, "posts"), postData);
    return docRef.id;
}
