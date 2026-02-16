import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import { CharacterBible, CharacterProfile } from "@/types/character";

export const DEFAULT_BIBLE: CharacterBible = {
    title: "Good Successful Happy Human",
    summary: "I am a good person who is successful, unconditionally loved, and I enjoy my life.",
    avatar_url: "",
    core_beliefs: [],
    rules: [],
    thoughts: [],
    habits: [],
    consumption: { food: [], media: [] },
    positive_events: [],
    wants: [],
    goals: [],
    relationships: [],
    role_models: [],
    music: [],
    movies: [],
    tv_shows: [],
    visual_board: [],
    suggested_actions: [],
    last_updated: Date.now()
};

/**
 * Fetches the Character Bible for a user.
 * If it doesn't exist, it creates a default one.
 */
export async function getCharacterBible(uid: string): Promise<CharacterBible> {
    const docRef = doc(db, "users", uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data() as CharacterProfile;
        if (data.character_bible) {
            return { ...DEFAULT_BIBLE, ...data.character_bible }; // Safe merge
        }
    }

    // Initialize if missing
    await setDoc(docRef, { character_bible: DEFAULT_BIBLE }, { merge: true });
    return DEFAULT_BIBLE;
}

/**
 * Merges new data into the Character Bible.
 * Handles deduplication for arrays.
 */
export async function updateCharacterBible(uid: string, updates: Partial<CharacterBible>) {
    const currentBible = await getCharacterBible(uid);

    // Deep merge logic specific to arrays (union)
    const merged: CharacterBible = { ...currentBible };

    // 1. Arrays - simple overwrite if provided (Trust the client state, e.g. from Sheet Editor)
    if (updates.core_beliefs) merged.core_beliefs = updates.core_beliefs;
    if (updates.rules) merged.rules = updates.rules;
    if (updates.thoughts) merged.thoughts = updates.thoughts;
    if (updates.habits) merged.habits = updates.habits;
    if (updates.positive_events) merged.positive_events = updates.positive_events;
    if (updates.wants) merged.wants = updates.wants;
    if (updates.goals) merged.goals = updates.goals;
    if (updates.relationships) merged.relationships = updates.relationships;
    if (updates.role_models) merged.role_models = updates.role_models;
    if (updates.music) merged.music = updates.music;
    if (updates.movies) merged.movies = updates.movies;
    if (updates.tv_shows) merged.tv_shows = updates.tv_shows;
    if (updates.visual_board) merged.visual_board = updates.visual_board;
    if (updates.consumption) merged.consumption = updates.consumption;
    if (updates.suggested_actions) merged.suggested_actions = updates.suggested_actions;

    // 2. Overwrite scalars
    if (updates.title) merged.title = updates.title;
    if (updates.summary) merged.summary = updates.summary;
    if (updates.avatar_url) merged.avatar_url = updates.avatar_url;
    if (updates.living_situation) merged.living_situation = updates.living_situation;
    if (updates.birthday) merged.birthday = updates.birthday;
    if (updates.gender) merged.gender = updates.gender;

    merged.last_updated = Date.now();

    const docRef = doc(db, "users", uid);
    await updateDoc(docRef, {
        character_bible: merged,
        updatedAt: serverTimestamp()
    });

    return merged;
}

// ... (existing code)

/**
 * Returns valid Suggested Actions (not expired).
 */
export function getValidActions(bible: CharacterBible) {
    const now = Date.now();
    return (bible.suggested_actions || []).filter(action => action.expires_at > now && !action.is_completed);
}

import { onSnapshot } from "firebase/firestore";

/**
 * Subscribes to the Character Bible for real-time updates.
 */
export function subscribeToCharacterBible(uid: string, onUpdate: (bible: CharacterBible) => void) {
    const docRef = doc(db, "users", uid);
    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data() as CharacterProfile;
            if (data.character_bible) {
                onUpdate({ ...DEFAULT_BIBLE, ...data.character_bible });
            } else {
                onUpdate(DEFAULT_BIBLE);
            }
        } else {
            onUpdate(DEFAULT_BIBLE);
        }
    });
}
