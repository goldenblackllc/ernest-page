import { db } from "@/lib/firebase/config";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { geohashForLocation } from "geofire-common";

export interface CreatePostParams {
    content: string;
    content_raw?: string; // Original input (rant)
    authorId: string;
    authorName?: string;
    characterId?: string;
    constraints?: string[];
    tags?: string[];
    type?: 'text';
    // Optional structured data for extended display
    rant?: string;
    core_beliefs?: string[];
    likedBy?: string[];
    // Geolocation for proximity filtering
    lat?: number;
    lng?: number;
}

export async function createPost(params: CreatePostParams) {
    if (!params.authorId) throw new Error("User ID is required");

    // Compute geohash if coordinates are provided
    const geoFields: { lat?: number; lng?: number; geohash?: string } = {};
    if (params.lat != null && params.lng != null) {
        geoFields.lat = params.lat;
        geoFields.lng = params.lng;
        geoFields.geohash = geohashForLocation([params.lat, params.lng]);
    }

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

        // Geolocation
        ...geoFields,

        created_at: serverTimestamp(),
        likes: 0,
        likedBy: [],
        comments: 0
    };

    // Remove undefined keys
    Object.keys(postData).forEach(key => postData[key as keyof typeof postData] === undefined && delete postData[key as keyof typeof postData]);

    const docRef = await addDoc(collection(db, "posts"), postData);
    return docRef.id;
}

