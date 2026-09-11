import { doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "./config";
import { CharacterProfile, WantItem, ProfilePerson } from "@/types/character";

/**
 * Subscribes to the complete Character Profile for real-time updates.
 */
export function subscribeToCharacterProfile(uid: string, onUpdate: (profile: CharacterProfile) => void) {
    const docRef = doc(db, "users", uid);
    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data() as CharacterProfile;
            onUpdate({ ...data, uid });
        } else {
            onUpdate({ uid });
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

// ─── My Life Drawer Helpers ─────────────────────────────────────────────────

/**
 * Updates the "What I Want" checklist.
 */
export async function updateWants(uid: string, wants: WantItem[]) {
    const docRef = doc(db, "users", uid);
    await setDoc(docRef, {
        wants,
        bible_dirty_since: serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });
}

/**
 * Updates the "What I Love" interests list.
 */
export async function updateLoves(uid: string, interests: string[]) {
    const docRef = doc(db, "users", uid);
    await setDoc(docRef, {
        interests,
        bible_dirty_since: serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });
}

/**
 * Updates the "My People" list.
 */
export async function updatePeople(uid: string, people: ProfilePerson[]) {
    const docRef = doc(db, "users", uid);
    await setDoc(docRef, {
        people,
        bible_dirty_since: serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });
}

/**
 * Updates the "My Dream" fields (defining words, living situation, financial).
 */
export async function updateDream(uid: string, updates: {
    defining_words?: string[];
    dream_living?: string;
    dream_financial?: string;
}) {
    const docRef = doc(db, "users", uid);
    await setDoc(docRef, {
        ...updates,
        bible_dirty_since: serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });
}
