export interface CharacterBible {
    roles: string[];
    core_beliefs: string[];
    values: string[];
}

export interface CharacterProfile {
    uid: string;
    archetype_title: string;
    manifesto: string;
    character_bible?: CharacterBible; // Progressive Profiling
    avatar_image?: string;
    uniform?: string; // or JSON string
    base_state?: string; // or JSON string
    updatedAt?: any; // Firestore Timestamp
}

export interface Rule {
    id?: string;
    uid: string;
    trigger: string;
    old_rule: string;
    new_rule: string;
    active: boolean;
    createdAt: any; // Firestore Timestamp
}

export interface Directive {
    id?: string;
    uid: string;
    title: string;
    status: 'active' | 'completed' | 'pending';
    type: 'PROTOCOL' | 'QUEST' | 'SIGNAL';
    createdAt: any; // Firestore Timestamp
    source?: string; // e.g., 'recast', 'spark'
}
