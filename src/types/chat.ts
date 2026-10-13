export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

/** A session is kept privately or burned. Posts go public only when shared from the feed. */
export type SessionRouting = 'private' | 'burn';

/** Reads a stored routing; older records may say 'public', which now means private. */
export function toSessionRouting(value: unknown): SessionRouting {
    return value === 'burn' ? 'burn' : 'private';
}

export interface ActiveChat {
    id: string;          // Session ID
    uid: string;         // User ID
    messages: Message[]; // The chat transcript so far
    status: 'idle' | 'generating' | 'completed';
    updatedAt: number;   // Unix timestamp in ms
    createdAt: number;
    isClosed?: boolean;  // Flag for when user manually closes chat
    sessionRouting?: SessionRouting; // Private ledger, or burn on close
    burnOnClose?: boolean; // Safety flag — cron skips ALL processing and deletes immediately
    creditConsumed?: boolean; // Whether a session credit was consumed for this session
    creditRefunded?: boolean; // Whether the credit was auto-refunded (0-message close)
    closeReason?: 'user' | 'exchange-limit' | 'expired'; // How the session ended
    user_photo_url?: string | null;
}
