export interface CharacterIdentity {
    title: string;              // 3 visual roles: "Father, Husband, Gentleman"
    dream_self: string;         // Present-tense identity summary (AI-generated from rant)
    dream_rant: string;         // Raw user input (their rant about their dream life)
    important_people: string;   // Foundation: Tell me about the people in your life
    things_i_enjoy: string;     // Foundation: What does the dream you enjoy?
    gender: string;             // User-provided gender identity
    age: string;                // User-provided age
    ethnicity?: string;         // Optional — unchangeable physical traits for avatar accuracy
    character_name?: string;    // Optional — user's chosen name for their Ideal Self
    dossier: string;            // AI-maintained structured case notes
    dossier_updated_at?: any;   // Firestore Timestamp
    session_count: number;      // Number of check-in/mirror sessions
    onboarding_started?: boolean;  // Gender submitted, user can access dashboard
    onboarding_complete?: boolean; // First session processed, character bible built
}

export interface CharacterBible {
    source_code: {
        archetype: string;
        manifesto: string;
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
    character_name?: string;    // Character's name (user-chosen or AI-generated)
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
    active_todos?: Array<{ id: string, task: string, completed: boolean, priority?: 'immediate' | 'next', unexpected_yield?: string, created_at: any }>;
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
    last_thirty_day_checkin?: string; // ISO date of last 28-day check-in session
    session_recaps?: Array<{     // Rolling window of last 3 session recaps
        date: string;            // ISO date string
        recap: string;           // 2-3 sentence summary
    }>;
    subscription?: {
        status: 'active' | 'canceled' | 'expired' | 'past_due';
        plan: 'proving_ground' | 'long_game' | 'archangel';
        subscribedAt: string;
        subscribedUntil?: string;           // Legacy — proving_ground / long_game
        currentPeriodEnd?: string;          // Archangel — Stripe-managed billing cycle end
        cancelAtPeriodEnd?: boolean;        // User requested cancel but access continues
        paymentIntentId?: string;           // Legacy — one-time payment
        stripeSubscriptionId?: string;      // Archangel — Stripe Subscription ID
        stripeCustomerId?: string;          // Archangel — Stripe Customer ID
        grantedBy?: 'admin' | 'stripe';
        canceledAt?: string;
        refunded?: boolean;
        lastInvoiceId?: string;             // Idempotency — last processed invoice
        paymentFailedAt?: string;           // When payment last failed
    };
    session_credits?: number; // Available chat sessions (default 0)
    sessions_today?: number;   // Sessions consumed today (resets daily)
    sessions_today_date?: string; // ISO date string (YYYY-MM-DD) — used to detect day rollover
    session_purchases?: Array<{
        id: string;               // paymentIntentId
        type: 'session_single' | 'session_3pack' | 'session_gift';
        amount: number;           // cents
        credits: number;          // how many sessions this purchase granted
        purchasedAt: string;      // ISO date
        refunded?: boolean;       // Whether this purchase was refunded
        refundedAt?: string;      // ISO date of refund
    }>;
    refund_count?: number;          // Total lifetime refunds issued
    total_sessions_purchased?: number; // Total lifetime sessions purchased (for trust tier)
    compile_count?: number;         // Character bible compiles used today
    compile_count_date?: string;    // ISO date (YYYY-MM-DD) for rollover detection
    last_compile_at?: number;       // Unix timestamp of last compile (for cooldown)
    daily_digest?: {
        title: string;
        content: string;
        full_content?: string;
        image_url?: string | null;
        date: string;
        updated_at: string;
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
