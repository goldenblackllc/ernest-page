import { doc, getDoc, setDoc, onSnapshot, deleteDoc } from "firebase/firestore";
import { db } from "./config";
import { ActiveChat } from "@/types/chat";

/**
 * Gets the current active chat session for a user.
 */
export async function getActiveChat(uid: string, sessionId: string = "mirror"): Promise<ActiveChat | null> {
    const docRef = doc(db, "users", uid, "active_chats", sessionId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data() as ActiveChat;
    }
    return null;
}

/**
 * Creates or updates an active chat session.
 */
export async function saveActiveChat(uid: string, chatData: Partial<ActiveChat>, sessionId: string = "mirror") {
    const docRef = doc(db, "users", uid, "active_chats", sessionId);
    await setDoc(docRef, {
        ...chatData,
        updatedAt: Date.now()
    }, { merge: true });
}

/**
 * Subscribes to the active chat for real-time updates.
 */
export function subscribeToActiveChat(uid: string, onUpdate: (chat: ActiveChat | null) => void, sessionId: string = "mirror") {
    const docRef = doc(db, "users", uid, "active_chats", sessionId);
    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            onUpdate(docSnap.data() as ActiveChat);
        } else {
            onUpdate(null);
        }
    });
}

/**
 * Deletes an active chat session.
 */
export async function deleteActiveChat(uid: string, sessionId: string = "mirror") {
    const docRef = doc(db, "users", uid, "active_chats", sessionId);
    await deleteDoc(docRef);
}
