export interface CharacterBible {
    // --- IDENTITY CORE ---
    title: string;          // Default: "Good Successful Happy Human"
    summary: string;        // Default: "I am a good person who is successful, unconditionally loved, and I enjoy my life."
    avatar_url?: string;    // Main character image

    // --- PSYCHOGRAPHICS (The Software) ---
    core_beliefs: string[]; // Merged list of "I am..." statements.
    rules: {
        id: string;
        rule: string;         // e.g. "I budget monthly."
        description?: string; // e.g. "I take time to plan..."
        category?: string;    // e.g. "Finance", "Health"
    }[];
    thoughts: string[];     // General mental models / mantras.

    // --- LIFESTYLE (The Hardware) ---
    habits: string[];       // Daily routines.
    consumption: {
        food: string[];
        media: string[];      // General consumption rules.
    };
    positive_events: string[]; // "What makes me happy"
    wants: string[];
    goals: string[];

    // --- CONTEXT & DEMOGRAPHICS ---
    birthday?: any;        // Firestore Timestamp or Date
    gender?: string;
    living_situation?: string; // Free text: "Rent, family, etc."

    // --- SOCIAL & INFLUENCES ---
    relationships: {
        name: string;
        relation: string;     // e.g. "Partner", "Child"
        notes?: string;       // e.g. "Loves dinosaurs"
    }[];
    role_models: {
        name: string;
        reason?: string;      // Why they are a role model.
    }[];

    // --- MEDIA FAVORITES ---
    music: string[];
    movies: string[];
    tv_shows: string[];

    // --- VISUAL ANCHORS (Photos) ---
    visual_board: {
        label: string;        // e.g. "Ideal Home", "Fitness Goal"
        image_url: string;
    }[];

    // --- ACTION LAYER ---
    suggested_actions: {
        id: string;
        text: string;
        created_at: number;
        expires_at: number;   // Usually 7 days from creation.
        is_completed: boolean;
    }[];

    // --- SYSTEM METADATA ---
    last_updated: number;   // Timestamp for the "Batch Post" logic.
}

export interface CharacterProfile {
    uid: string;
    character_bible: CharacterBible; // Now mandatory structure
    updatedAt?: any; // Firestore Timestamp
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
