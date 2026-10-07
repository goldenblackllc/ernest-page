export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

export type SessionRouting = 'public' | 'private' | 'burn';

export interface ActiveChat {
    id: string;          // Session ID
    uid: string;         // User ID
    messages: Message[]; // The chat transcript so far
    status: 'idle' | 'generating' | 'completed';
    updatedAt: number;   // Unix timestamp in ms
    createdAt: number;
    isClosed?: boolean;  // Flag for when user manually closes chat
    autoPublish?: boolean; // Whether to generate a public post from this conversation
    sessionRouting?: SessionRouting; // Tri-state routing: public feed, private ledger, or burn on close
    burnOnClose?: boolean; // Safety flag — cron skips ALL processing and deletes immediately
    creditConsumed?: boolean; // Whether a session credit was consumed for this session
    creditRefunded?: boolean; // Whether the credit was auto-refunded (0-message close)
    closeReason?: 'user' | 'exchange-limit' | 'expired'; // How the session ended
    user_photo_url?: string | null;
}
