export interface CharacterBible {
    source_code: {
        archetype: string;
        manifesto: string;
        core_beliefs: string;
        important_people: string;
        current_constraints: string; // The new "Inventory/Reality Anchor" field
        things_i_enjoy?: string; // Preferences & Aesthetics
    };
    compiled_bible: {
        core_identity?: any;
        psychological_profile?: any;
        interpersonal_dynamics?: any;
        lifestyle?: any;
        behavioral_responses?: any;
        [key: string]: any;
    };
    compiled_output?: {
        ideal?: Array<{ heading: string, content: string }>;
    };

    // --- SYSTEM METADATA ---
    last_updated: number;   // Timestamp for the "Batch Post" logic.
    version?: number;       // e.g. 1.0, 1.1
    last_commit?: any;      // Firestore Timestamp of last "Finish & Commit"
    status?: 'stable' | 'compiling'; // Lockout state during updates
}

export interface CharacterProfile {
    uid: string;
    character_bible: CharacterBible; // Now mandatory structure
    my_story?: string;
    active_todos?: Array<{ id: string, task: string, completed: boolean, created_at: any }>;
    following?: Record<string, string>; // authorId -> custom Alias
    region?: string; // e.g., 'US-MA'
    last_check_in?: any;
    updatedAt?: any; // Firestore Timestamp
    saved_posts?: string[]; // Bookmarked posts
}

export interface Directive {
    id?: string;
    uid: string;
    title: string;
    status: 'active' | 'completed' | 'pending';
    type: 'PROTOCOL' | 'QUEST' | 'SIGNAL';
    createdAt: any; // Firestore Timestamp
    source?: string; // e.g., 'recast', 'spark'
    expiresAt?: any;
}
