import { useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { MASTER_BELIEFS } from '@/lib/constants/beliefs';

// --- TYPES ---


export interface Belief {
    negative: string;
    positive: string;
}

export interface Rule {
    title: string;
    description: string;
    action?: 'add' | 'remove' | 'keep';
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

export interface WizardState {
    step: number; // 1 to 5
    rant: string;

    // Step 3.5: User Calibration
    calibration: {
        title: string;
        summary: string;
    };

    // Step 2: Beliefs
    generatedBeliefs: Belief[];
    selectedBeliefs: Belief[];

    // Step 4: Vision (Micro-Scenes) - Replaces Thoughts
    generatedVision: Vision[];
    selectedVision: Vision[];

    // Step 5: Strategies (System Update)
    patch: Patch | null;

    // For UI compatibility, we might filter these from the patch
    selectedRules: Rule[]; // We'll store the "New Rules" here for selection? 
    // Or just "Proposed" vs "Selected"?
    // Let's keep it simple: "New Rules" are auto-selected. 
    // "Deprecated" are auto-selected for removal.

    // Step 6: Actions (Immediate Steps)
    generatedActions: string[];
    selectedActions: string[];
}

// --- HOOK ---

export function useProblemWizard() {
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [state, setState] = useState<WizardState>({
        step: 1,
        rant: "",
        calibration: { title: "", summary: "" },
        generatedBeliefs: [],
        selectedBeliefs: [],
        generatedVision: [],
        selectedVision: [],
        patch: null,
        selectedRules: [],
        generatedActions: [],
        selectedActions: [],
    });

    // --- GENERIC API CALLER ---

    const callApi = useCallback(async (mode: string, payload: any) => {
        if (!user) {
            setError("User not authenticated");
            return null;
        }
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/recast', {
                method: 'POST',
                body: JSON.stringify({ mode, uid: user.uid, ...payload }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || `API Request Failed: ${res.statusText}`);
            }

            return data;
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred");
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    // --- INITIALIZATION ---
    // Fetch Character Context on load
    useState(() => {
        const init = async () => {
            if (user) {
                try {
                    const res = await callApi('get_context', {});
                    if (res?.bible) {
                        setState(prev => ({
                            ...prev,
                            calibration: {
                                title: res.bible.title || res.bible.roles?.[0] || "",
                                summary: res.bible.summary || ""
                            }
                        }));
                    }
                } catch (e) {
                    console.error("Failed to load context", e);
                }
            }
        };
        init();
    });


    // --- ACTIONS ---

    const setRant = (rant: string) => setState(prev => ({ ...prev, rant }));

    // HELPER: Map strings to Belief Objects
    const mapBeliefs = (beliefStrings: string[]): Belief[] => {
        return beliefStrings.map(s => {
            const found = MASTER_BELIEFS.find(b => b.negative === s);
            return found ? { negative: found.negative, positive: found.positive } : { negative: s, positive: "I am Free." }; // Fallback
        });
    };

    const updateCalibration = (field: 'title' | 'summary', value: string) => {
        setState(prev => ({
            ...prev,
            calibration: { ...prev.calibration, [field]: value }
        }));
    };

    const saveCalibration = async () => {
        await callApi('update_bible', state.calibration);
        await generateVision(); // Generate Vision based on new calibration
    };

    // STEP 1 -> 2: GENERATE BELIEFS
    const generateBeliefs = async () => {
        if (!state.rant.trim()) return;

        const result = await callApi('beliefs', { rant: state.rant });
        if (result?.beliefs) {
            // result.beliefs is string[]
            const mappedBeliefs = mapBeliefs(result.beliefs);

            setState(prev => ({
                ...prev,
                generatedBeliefs: mappedBeliefs,
                step: 2
            }));
        }
    };

    const toggleBelief = (belief: Belief) => {
        setState(prev => {
            const exists = prev.selectedBeliefs.find(b => b.negative === belief.negative);
            if (exists) {
                return { ...prev, selectedBeliefs: prev.selectedBeliefs.filter(b => b.negative !== belief.negative) };
            }
            if (prev.selectedBeliefs.length >= 3) return prev; // Max 3
            return { ...prev, selectedBeliefs: [...prev.selectedBeliefs, belief] };
        });
    };

    // STEP 2 -> 3: CONFIRM THE SHIFT (UI Transition only, no API)
    // The UI handles this transition once beliefs are selected.

    // STEP 3 -> 4: GENERATE VISION (Was Thoughts)
    const generateVision = async () => {
        if (state.selectedBeliefs.length === 0) {
            setError("Please select at least one belief to proceed.");
            return;
        }

        const result = await callApi('vision', {
            selected_beliefs: state.selectedBeliefs,
            rant: state.rant,
            calibration: state.calibration // Pass calibration data
        });

        if (result?.vision) {
            setState(prev => ({
                ...prev,
                generatedVision: result.vision,
                selectedVision: [], // User must select
                step: 4
            }));
        }
    };

    const toggleVision = (vision: Vision) => {
        setState(prev => {
            const exists = prev.selectedVision.find(v => v.title === vision.title);
            if (exists) {
                return { ...prev, selectedVision: prev.selectedVision.filter(v => v.title !== vision.title) };
            }

            if (prev.selectedVision.length >= 3) return prev; // Max 3
            return { ...prev, selectedVision: [...prev.selectedVision, vision] };
        });
    };

    // STEP 4 -> 5: GENERATE CONSTRAINTS (System Update)
    const generateConstraints = async () => {
        if (state.selectedVision.length === 0) {
            setError("Please select at least one vision card to proceed.");
            return;
        }

        const result = await callApi('constraints', {
            selected_vision: state.selectedVision,
            rant: state.rant
        });

        if (result?.patch) {
            // result.patch includes { new_rules, deprecated_ids, reason }

            setState(prev => ({
                ...prev,
                patch: result.patch,
                selectedRules: result.patch.new_rules, // Auto-select new rules for "Install"
                step: 5
            }));
        }
    };

    const toggleRule = (rule: Rule) => {
        // Toggle "New Rules" selection
        setState(prev => {
            const exists = prev.selectedRules.find(r => r.title === rule.title);
            if (exists) {
                return { ...prev, selectedRules: prev.selectedRules.filter(r => r.title !== rule.title) };
            }
            return { ...prev, selectedRules: [...prev.selectedRules, rule] };
        });
    };

    const updateRule = (index: number, updatedRule: Rule) => {
        // Update Title/Description of a NEW rule (in the patch)
        setState(prev => {
            if (!prev.patch) return prev;

            const newRules = [...prev.patch.new_rules];
            if (index >= 0 && index < newRules.length) {
                newRules[index] = updatedRule;
            }

            // Also update selected
            const newSelected = prev.selectedRules.map(r => r.title === prev.patch!.new_rules[index].title ? updatedRule : r);

            return {
                ...prev,
                patch: { ...prev.patch!, new_rules: newRules },
                selectedRules: newSelected
            };
        });
    };

    // NAVIGATION
    const nextStep = () => setState(prev => ({ ...prev, step: prev.step + 1 }));
    const prevStep = () => setState(prev => ({ ...prev, step: prev.step - 1 }));

    // GENERATE GHOST STORY (Final Step)
    const generateGhostStory = async () => {
        // Generate actions silently if we skipped Step 6
        let actions: string[] = [];

        try {
            const actionRes = await callApi('actions', {
                selected_vision: state.selectedVision,
                new_rules: state.selectedRules,
                rant: state.rant
            });
            if (actionRes?.actions) actions = actionRes.actions;
        } catch (e) {
            console.warn("Failed to generate actions silently", e);
        }

        const result = await callApi('ghost_writer', {
            rant: state.rant,
            beliefs: state.selectedBeliefs,
            vision: state.selectedVision[0], // Use primary vision
            rules: state.selectedRules,
            deprecated_rules: state.patch?.deprecated_ids.map(id => ({ id })),
            actions: actions,
            reason: state.patch?.reason
        });

        return result?.story;
    };


    // --- REGENERATE ---

    const regenerateStep = async (stepNumber: number) => {
        if (stepNumber === 2) {
            generateBeliefs();
        } else if (stepNumber === 4) {
            generateVision();
        } else if (stepNumber === 5) {
            generateConstraints();
        }
    };


    return {
        state,
        isLoading,
        error,
        setRant,
        generateBeliefs,
        toggleBelief,
        generateVision, // Replaces generateThoughts
        toggleVision,   // Replaces toggleThought
        generateConstraints, // Replaces generateRules
        toggleRule,
        updateRule,
        regenerateStep,
        nextStep,
        prevStep,
        updateCalibration,
        saveCalibration,
        generateGhostStory
    };
}
