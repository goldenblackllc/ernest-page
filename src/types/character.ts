export interface CharacterIdentity {
    title: string;              // 3 visual roles: "Father, Husband, Gentleman"
    dream_self: string;         // Present-tense identity summary (AI-generated from rant)
    dream_rant: string;         // Raw user input (their rant about their dream life)
    important_people: string;   // Foundation: Tell me about the people in your life
    things_i_enjoy: string;     // Foundation: What does the dream you enjoy?
    gender: string;             // User-provided gender identity
    age: string;                // User-provided age
    ethnicity?: string;         // Optional — unchangeable physical traits for avatar accuracy
    dossier: string;            // AI-maintained structured case notes
    dossier_updated_at?: any;   // Firestore Timestamp
    session_count: number;      // Number of check-in/mirror sessions
    belief_patterns?: string;   // AI-maintained summary of recurring beliefs, excitement signals, and shifts
    monthly_reviews?: Array<{   // Monthly character review letters from the Ideal Self
        id: string;
        month: string;
        content: string;
        read?: boolean;
        created_at: any;
    }>;
}

export interface CharacterBible {
    source_code: {
        archetype: string;
        manifesto: string;
        core_beliefs: string;
        important_people: string;
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
        avatar_url?: string;
    };

    // --- SYSTEM METADATA ---
    last_updated: number;   // Timestamp for the "Batch Post" logic.
    version?: number;       // e.g. 1.0, 1.1
    last_commit?: any;      // Firestore Timestamp of last "Finish & Commit"
    status?: 'stable' | 'compiling' | 'ready'; // Lockout state during updates
}

export interface CharacterProfile {
    uid: string;
    identity?: CharacterIdentity;   // New onboarding-driven identity
    character_bible: CharacterBible; // Now mandatory structure
    my_story?: string;
    active_todos?: Array<{ id: string, task: string, completed: boolean, priority?: 'immediate' | 'next', created_at: any }>;
    following?: Record<string, string>; // authorId -> custom Alias
    region?: string; // e.g., 'US-MA'
    home_lat?: number; // Latitude for proximity filtering (200-mile blind spot)
    home_lng?: number; // Longitude for proximity filtering
    last_check_in?: any;
    updatedAt?: any; // Firestore Timestamp
    saved_posts?: string[]; // Bookmarked posts
    default_post_routing?: 'public' | 'private'; // Default routing for new Mirror Chat sessions
    firewall_synced?: boolean; // Whether user has completed the Contact Firewall step
    proximity_anchor?: string; // Zip code or city for Proximity Blind Spot radius
    subscription?: {
        status: 'active' | 'canceled' | 'expired';
        plan: 'executive_retainer' | 'founders_key';
        subscribedAt: string;
    };
}

export interface Directive {
    id?: string;
    uid: string;
    title: string;
    status: 'active' | 'completed' | 'pending';
    type: 'PROTOCOL' | 'QUEST' | 'SIGNAL';
    createdAt: any; // Firestore Timestamp
    source?: string; // e.g., 'spark'
    expiresAt?: any;
}
