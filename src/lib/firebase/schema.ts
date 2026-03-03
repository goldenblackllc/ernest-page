import { Timestamp } from "firebase/firestore";

// Collection: definitions
// Usage: The user's static source code.
export interface CoreBelief {
    id: string;
    text: string;
    type: 'core_belief';
}

// Collection: master_actions
// Usage: A backlog of potential actions.
export interface MasterAction {
    id: string;
    title: string;
    excitement_score: number; // 1-10
    created_at: Timestamp;
}


// Collection: entries
// Usage: The core "Newspaper Articles."
export interface Entry {
    id: string;
    headline: string;
    image_url?: string;
    unexpected_outcome: string;
    status: 'in_progress' | 'published';
    created_at: Timestamp;
}

export const COLLECTIONS = {
    DEFINITIONS: 'definitions',
    MASTER_ACTIONS: 'master_actions',
    ENTRIES: 'entries',
} as const;
