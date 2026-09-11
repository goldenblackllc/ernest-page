/** A person in the user's life */
export interface ProfilePerson {
    name: string;
    relationship: string;          // e.g., 'daughter', 'boss', 'best friend'
    who?: string;                  // everything about the person: age, school/job, personality, interests, stable facts
    dynamic?: string;              // the user's relationship with them: emotional quality, shared history, financial ties
    birthday?: string;             // ISO date or partial (MM-DD)
}

/** A single item on the user's "What I Want" checklist */
export interface WantItem {
    id: string;
    text: string;
    completed: boolean;
    created_at: number;
}

/** Compiled character bible — system-generated output */
export interface Bible {
    sections?: Array<{ heading: string; content: string }>;
    status?: 'stable' | 'compiling' | 'ready' | 'failed';
    fail_reason?: string;
    last_updated?: number;
    last_commit?: any;  // Firestore Timestamp
}

/** Avatar — system-generated */
export interface Avatar {
    url?: string;
    status?: 'ready' | 'generating' | 'pending' | 'failed';
    last_attempt?: number;
    attempt_count?: number;
    error?: string | null;
}

/** Voice — system-assigned or user-selected */
export interface Voice {
    id?: string;
    name?: string;
    confirmed?: boolean;
}

/** Root user document — `users/{uid}` */
export interface CharacterProfile {
    uid: string;

    // --- User Inputs (top-level, drawer-edited) ---
    name?: string;                        // Ideal Self character name
    defining_words?: string[];            // 3 words that define the user
    wants?: WantItem[];                   // "What I Want" checklist
    interests?: string[];                 // Things they love
    people?: ProfilePerson[];             // People in their life
    dream_living?: string;                // Dream living situation
    dream_financial?: string;             // Dream financial situation

    // --- Physical Appearance (top-level, EditAvatarModal) ---
    gender?: string;
    birthdate?: string;                   // ISO date (YYYY-MM-DD)
    ethnicity?: string;
    skin_tone?: string;
    hair_colors?: string[];
    hair_texture?: string;
    hair_volume?: string;
    eye_color?: string;
    height?: string;

    // --- System Outputs ---
    bible?: Bible;
    avatar?: Avatar;
    voice?: Voice;

    // --- AI-Maintained ---
    dossier?: string;                     // 7-section case notes
    dossier_updated_at?: any;             // Firestore Timestamp
    session_count?: number;
    session_recaps?: Array<{
        date: string;
        recap: string;
    }>;

    // --- App State ---
    onboarding_complete?: boolean;
    bible_dirty_since?: any;              // Firestore Timestamp — triggers recompile cron
    last_compile_at?: number;
    compile_count?: number;
    compile_count_date?: string;

    // --- Account ---
    active_todos?: Array<{ id: string; task: string; completed: boolean; priority?: 'immediate' | 'next'; unexpected_yield?: string; created_at: any }>;
    following?: Record<string, string>;
    updatedAt?: any;
    saved_posts?: string[];
    default_post_routing?: 'private' | 'public' | 'burn';
    last_thirty_day_checkin?: string;
    subscription?: {
        status: 'active' | 'canceled' | 'expired' | 'past_due';
        plan: 'proving_ground' | 'long_game' | 'archangel';
        subscribedAt: string;
        subscribedUntil?: string;
        currentPeriodEnd?: string;
        cancelAtPeriodEnd?: boolean;
        paymentIntentId?: string;
        stripeSubscriptionId?: string;
        stripeCustomerId?: string;
        grantedBy?: 'admin' | 'stripe';
        canceledAt?: string;
        refunded?: boolean;
        lastInvoiceId?: string;
        paymentFailedAt?: string;
    };
    session_credits?: number;
    sessions_today?: number;
    sessions_today_date?: string;
    session_purchases?: Array<{
        id: string;
        type: 'session_single' | 'session_3pack' | 'session_gift';
        amount: number;
        credits: number;
        purchasedAt: string;
        refunded?: boolean;
        refundedAt?: string;
    }>;
    refund_count?: number;
    total_sessions_purchased?: number;
    daily_digest?: {
        title: string;
        content: string;
        full_content?: string;
        image_url?: string | null;
        imagen_urls?: string[];
        image_style?: 'per-message';
        image_prompts?: string[];
        message_images?: string[];
        condensed_transcript?: Array<{ role: 'user' | 'ideal_self'; text: string }>;
        thumbnail_url?: string | null;
        audio_url?: string | null;
        audio_word_timestamps?: Array<{ word: string; start: number; end: number }>;
        audio_message_boundaries?: Array<{ role: string; startIndex: number; endIndex: number; startTime: number; endTime: number }>;
        date: string;
        updated_at: string;
    };
    beta_tester?: {
        cohort: string;
        enrolled_at: string;
        invite_code: string;
        source: string;
        tiktok_handle?: string;
        name?: string;
    };
}

// --- Legacy type aliases for backward compatibility during migration ---
// TODO: Remove these once all imports are updated
export type CharacterIdentity = any;
export type CharacterBible = any;
export type UnifiedProfile = any;

export interface Directive {
    id?: string;
    uid: string;
    title: string;
    status: 'active' | 'completed' | 'pending';
    type: 'PROTOCOL' | 'QUEST' | 'SIGNAL';
    createdAt: any;
    source?: string;
    expiresAt?: any;
}
