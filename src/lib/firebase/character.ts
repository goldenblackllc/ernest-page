import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "./config";
import { CharacterBible, CharacterProfile } from "@/types/character";

export const DEFAULT_BIBLE: CharacterBible = {
    source_code: {
        archetype: "Good Successful Happy Human",
        manifesto: "I am a good person who is successful, unconditionally loved, and I enjoy my life.",
        important_people: "",
    },
    compiled_bible: {},
    compiled_output: {
        ideal: []
    },
    last_updated: Date.now()
};

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

            onUpdate({ ...data, uid, character_bible: migratedBible });
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
