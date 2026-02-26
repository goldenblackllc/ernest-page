import { Message } from '@ai-sdk/react';

export interface ActiveChat {
    id: string;          // Session ID
    uid: string;         // User ID
    messages: Message[]; // The chat transcript so far
    status: 'idle' | 'generating' | 'completed';
    updatedAt: number;   // Unix timestamp in ms
    createdAt: number;
}
