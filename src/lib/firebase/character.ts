import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import { CharacterBible, CharacterProfile } from "@/types/character";

const DEFAULT_BIBLE: CharacterBible = {
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

    // 1. Core Beliefs (Dedupe strings)
    if (updates.core_beliefs) {
        merged.core_beliefs = Array.from(new Set([...currentBible.core_beliefs, ...updates.core_beliefs]));
    }

    // 2. Rules (Dedupe by ID or Content)
    if (updates.rules) {
        const existingRules = currentBible.rules || [];
        const newRules = updates.rules;
        // Simple append for now, but in future could check for semantic dupes
        // Using Map to dedupe by ID if provided, otherwise append
        const ruleMap = new Map(existingRules.map(r => [r.id || r.rule, r]));
        newRules.forEach(r => ruleMap.set(r.id || r.rule, r));
        merged.rules = Array.from(ruleMap.values());
    }

    // 3. Simple Arrays (Goals, Wants, Habits)
    (['goals', 'wants', 'habits', 'thoughts', 'positive_events'] as const).forEach(key => {
        if (updates[key]) {
            // @ts-ignore
            merged[key] = Array.from(new Set([...(currentBible[key] || []), ...updates[key]]));
        }
    });

    // 4. Overwrite scalars
    if (updates.title) merged.title = updates.title;
    if (updates.summary) merged.summary = updates.summary;
    if (updates.avatar_url) merged.avatar_url = updates.avatar_url;

    merged.last_updated = Date.now();

    const docRef = doc(db, "users", uid);
    await updateDoc(docRef, {
        character_bible: merged,
        updatedAt: serverTimestamp()
    });

    return merged;
}

/**
 * Returns valid Suggested Actions (not expired).
 */
export function getValidActions(bible: CharacterBible) {
    const now = Date.now();
    return (bible.suggested_actions || []).filter(action => action.expires_at > now && !action.is_completed);
}
