import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./config";
import { CharacterBible, CharacterProfile } from "@/types/character";

export const DEFAULT_BIBLE: CharacterBible = {
    source_code: {
        archetype: "Good Successful Happy Human",
        manifesto: "I am a good person who is successful, unconditionally loved, and I enjoy my life.",
        core_beliefs: "",
        important_people: "",
        current_constraints: ""
    },
    compiled_bible: {},
    compiled_output: {
        ideal: []
    },
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
            // Safety: Make sure source_code and compiled_bible exist if migrating
            const migratedBible: CharacterBible = {
                ...DEFAULT_BIBLE,
                ...data.character_bible,
                source_code: {
                    ...DEFAULT_BIBLE.source_code,
                    ...(data.character_bible.source_code || {})
                },
                compiled_bible: data.character_bible.compiled_bible || {},
                compiled_output: data.character_bible.compiled_output || { ideal: [] }
            };
            return migratedBible;
        }
    }

    // Initialize if missing
    await setDoc(docRef, { character_bible: DEFAULT_BIBLE }, { merge: true });
    return DEFAULT_BIBLE;
}

/**
 * Merges new data into the Character Bible.
 */
export async function updateCharacterBible(uid: string, updates: Partial<CharacterBible>) {
    const currentBible = await getCharacterBible(uid);

    const merged: CharacterBible = { ...currentBible };

    // Deep merge source code
    if (updates.source_code) {
        merged.source_code = {
            ...merged.source_code,
            ...updates.source_code
        };
    }

    // Deep merge compiled bible
    if (updates.compiled_bible) {
        merged.compiled_bible = {
            ...merged.compiled_bible,
            ...updates.compiled_bible
        };
    }

    // Replace compiled output
    if (updates.compiled_output) {
        merged.compiled_output = updates.compiled_output;
    }

    if (updates.status) merged.status = updates.status;
    if (updates.version) merged.version = updates.version;
    if (updates.last_commit) merged.last_commit = updates.last_commit;

    merged.last_updated = Date.now();

    const docRef = doc(db, "users", uid);
    await updateDoc(docRef, {
        character_bible: merged,
        updatedAt: serverTimestamp()
    });

    return merged;
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
                const migratedBible: CharacterBible = {
                    ...DEFAULT_BIBLE,
                    ...data.character_bible,
                    source_code: {
                        ...DEFAULT_BIBLE.source_code,
                        ...(data.character_bible.source_code || {})
                    },
                    compiled_bible: data.character_bible.compiled_bible || {},
                    compiled_output: data.character_bible.compiled_output || { ideal: [] }
                };
                onUpdate(migratedBible);
            } else {
                onUpdate(DEFAULT_BIBLE);
            }
        } else {
            onUpdate(DEFAULT_BIBLE);
        }
    });
}

/**
 * Subscribes to the complete Character Profile for real-time updates.
 */
export function subscribeToCharacterProfile(uid: string, onUpdate: (profile: CharacterProfile) => void) {
    const docRef = doc(db, "users", uid);
    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data() as CharacterProfile;

            // Migrate bible inside profile if needed
            const migratedBible: CharacterBible = {
                ...DEFAULT_BIBLE,
                ...data.character_bible,
                source_code: {
                    ...DEFAULT_BIBLE.source_code,
                    ...(data.character_bible?.source_code || {})
                },
                compiled_bible: data.character_bible?.compiled_bible || {},
                compiled_output: data.character_bible?.compiled_output || { ideal: [] }
            };

            onUpdate({ ...data, character_bible: migratedBible });
        } else {
            onUpdate({ uid, character_bible: DEFAULT_BIBLE });
        }
    });
}

/**
 * Updates top-level fields on the Character Profile.
 */
export async function updateCharacterProfile(uid: string, updates: Partial<CharacterProfile>) {
    const docRef = doc(db, "users", uid);
    await setDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp()
    }, { merge: true });
}
