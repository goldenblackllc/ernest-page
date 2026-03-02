import { Message } from '@ai-sdk/react';

export type SessionTone = 'tough-love' | 'patient-mentor' | 'peer' | 'socratic';

export interface ActiveChat {
    id: string;          // Session ID
    uid: string;         // User ID
    messages: Message[]; // The chat transcript so far
    status: 'idle' | 'generating' | 'completed';
    updatedAt: number;   // Unix timestamp in ms
    createdAt: number;
    isClosed?: boolean;  // Flag for when user manually closes chat
    sessionTone?: SessionTone; // Engagement tone for this session
}
