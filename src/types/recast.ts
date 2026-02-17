export type RecastMode = 'PROBLEM' | 'DESIRE';

export interface Belief {
    negative: string;
    positive: string;
}

export interface Rule {
    title: string;
    description: string;
    action?: 'add' | 'remove' | 'keep';
    id?: string;
}

export interface Vision {
    title: string;
    description: string;
}

export interface Patch {
    new_rules: Rule[];
    deprecated_ids: string[];
    reason: string;
}

// Unified "Driver" interface for Beliefs (Problem) or Emotions (Desire)
export interface Driver {
    id: string; // The text itself
    type: 'BELIEF' | 'EMOTION';
    negative?: string; // For Beliefs 
    positive?: string; // For Beliefs 
}

export interface RecastState {
    mode: RecastMode;
    step: number; // 1 to 5
    input_text: string; // Was "rant"

    // Step 3.5: User Calibration
    calibration: {
        title: string;
        summary: string;
    };

    // Step 2: Diagnosis (Beliefs or Emotions)
    generatedDrivers: Driver[];
    selectedDrivers: Driver[];

    // Step 4: Vision (Micro-Scenes)
    generatedVision: Vision[];
    selectedVision: Vision[];

    // Step 5: System Update (Constraints/Rules)
    patch: Patch | null;
    selectedRules: Rule[];

    // Legacy support or extra
    generatedActions: string[];
    selectedActions: string[];
}
