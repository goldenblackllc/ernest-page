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
}

export interface WizardState {
    step: number; // 1 to 5
    rant: string;

    // Step 2: Beliefs
    generatedBeliefs: Belief[];
    selectedBeliefs: Belief[];

    // Step 4: Thoughts (New Mental Models)
    generatedThoughts: string[];
    selectedThoughts: string[];

    // Step 5: Rules (New Operating Instructions)
    // Step 5: Rules (New Operating Instructions)
    generatedRules: Rule[];
    selectedRules: Rule[];

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
        generatedBeliefs: [],
        selectedBeliefs: [],
        generatedThoughts: [],
        selectedThoughts: [],
        generatedRules: [],
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
            if (!res.ok) throw new Error(`API call failed: ${res.statusText}`);
            const data = await res.json();
            return data;
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred");
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [user]);


    // --- ACTIONS ---

    const setRant = (rant: string) => setState(prev => ({ ...prev, rant }));

    // HELPER: Map strings to Belief Objects
    const mapBeliefs = (beliefStrings: string[]): Belief[] => {
        return beliefStrings.map(s => {
            const found = MASTER_BELIEFS.find(b => b.negative === s);
            return found ? { negative: found.negative, positive: found.positive } : { negative: s, positive: "I am Free." }; // Fallback
        });
    };

    // STEP 1 -> 2: GENERATE BELIEFS
    const generateBeliefs = async () => {
        if (!state.rant.trim()) return;

        // If we already have beliefs, just move to step 2 (prevent accidental regen)
        if (state.generatedBeliefs.length > 0) {
            setState(prev => ({ ...prev, step: 2 }));
            return;
        }

        const result = await callApi('beliefs', { rant: state.rant });
        if (result?.beliefs) {
            // result.beliefs is string[]
            const mappedBeliefs = mapBeliefs(result.beliefs);

            setState(prev => ({
                ...prev,
                generatedBeliefs: mappedBeliefs,
                selectedBeliefs: mappedBeliefs, // Select ALL by default
                step: 2
            }));
        }
    };

    const toggleBelief = (belief: Belief) => {
        setState(prev => {
            const exists = prev.selectedBeliefs.find(b => b.negative === belief.negative);
            return {
                ...prev,
                selectedBeliefs: exists
                    ? prev.selectedBeliefs.filter(b => b.negative !== belief.negative)
                    : [...prev.selectedBeliefs, belief]
            };
        });
    };

    // GENERATE THOUGHTS (Step 4)
    const generateThoughts = async () => {
        if (state.selectedBeliefs.length === 0) {
            setError("Please select at least one belief to proceed.");
            return;
        }

        // If we already have thoughts, just move to step 4
        if (state.generatedThoughts.length > 0) {
            setState(prev => ({ ...prev, step: 4 }));
            return;
        }

        const result = await callApi('thoughts', {
            selected_beliefs: state.selectedBeliefs,
            rant: state.rant
        });

        if (result?.empowered_thoughts) {
            setState(prev => ({
                ...prev,
                generatedThoughts: result.empowered_thoughts,
                selectedThoughts: [],
                step: 4
            }));
        }
    };

    const toggleThought = (thought: string) => {
        setState(prev => {
            const exists = prev.selectedThoughts.includes(thought);
            return {
                ...prev,
                selectedThoughts: exists
                    ? prev.selectedThoughts.filter(t => t !== thought)
                    : [...prev.selectedThoughts, thought]
            };
        });
    };

    // GENERATE RULES (Step 5)
    const generateRules = async () => {
        if (state.selectedThoughts.length === 0) {
            setError("Please select at least one thought to proceed.");
            return;
        }

        // If we already have rules, just move to step 5
        if (state.generatedRules.length > 0) {
            setState(prev => ({ ...prev, step: 5 }));
            return;
        }

        const result = await callApi('rules', {
            selected_thoughts: state.selectedThoughts,
            rant: state.rant
        });

        if (result?.rules) {
            setState(prev => ({
                ...prev,
                generatedRules: result.rules,
                selectedRules: [],
                step: 5
            }));
        }
    };

    const toggleRule = (rule: Rule) => {
        setState(prev => {
            const exists = prev.selectedRules.find(r => r.title === rule.title);
            return {
                ...prev,
                selectedRules: exists
                    ? prev.selectedRules.filter(r => r.title !== rule.title)
                    : [...prev.selectedRules, rule]
            };
        });
    };

    // GENERATE ACTIONS (Step 6)
    const generateActions = async () => {
        if (state.selectedRules.length === 0) {
            setError("Please select at least one rule to proceed.");
            return;
        }

        // If we already have actions, just move to step 6
        if (state.generatedActions.length > 0) {
            setState(prev => ({ ...prev, step: 6 }));
            return;
        }

        const result = await callApi('actions', {
            selected_rules: state.selectedRules.map(r => r.title),
            rant: state.rant
        });

        if (result?.actions) {
            setState(prev => ({
                ...prev,
                generatedActions: result.actions,
                selectedActions: [],
                step: 6
            }));
        }
    };

    const toggleAction = (action: string) => {
        setState(prev => {
            const exists = prev.selectedActions.includes(action);
            return {
                ...prev,
                selectedActions: exists
                    ? prev.selectedActions.filter(a => a !== action)
                    : [...prev.selectedActions, action]
            };
        });
    };

    // --- REGENERATE ---

    const regenerateStep = async (stepNumber: number) => {
        let mode = '';
        let payload: any = {};

        if (stepNumber === 2) {
            mode = 'beliefs';
            payload = { rant: state.rant, kept_items: state.selectedBeliefs };
        } else if (stepNumber === 4) {
            mode = 'thoughts';
            payload = { selected_beliefs: state.selectedBeliefs, rant: state.rant, kept_items: state.selectedThoughts };
        } else if (stepNumber === 5) {
            mode = 'rules';
            payload = { selected_thoughts: state.selectedThoughts, rant: state.rant, kept_items: state.selectedRules };
        } else if (stepNumber === 6) {
            mode = 'actions';
            payload = { selected_rules: state.selectedRules.map(r => r.title), rant: state.rant, kept_items: state.selectedActions };
        } else {
            return;
        }

        const result = await callApi(mode, payload);

        if (result) {
            if (mode === 'beliefs' && result.beliefs) {
                const mappedBeliefs = mapBeliefs(result.beliefs);
                setState(prev => ({ ...prev, generatedBeliefs: mappedBeliefs }));
            }
            if (mode === 'thoughts' && result.empowered_thoughts) {
                setState(prev => ({ ...prev, generatedThoughts: result.empowered_thoughts }));
            }
            if (mode === 'rules' && result.rules) {
                setState(prev => ({ ...prev, generatedRules: result.rules }));
            }
            if (mode === 'actions' && result.actions) {
                setState(prev => ({ ...prev, generatedActions: result.actions }));
            }
        }
    };

    // --- NAVIGATION ---

    const updateRule = (index: number, newRule: Rule) => {
        setState(prev => {
            const oldRule = prev.generatedRules[index];
            const newGenerated = [...prev.generatedRules];
            newGenerated[index] = newRule;

            // Update selected if applicable (check by reference or title)
            const isSelected = prev.selectedRules.some(r => r === oldRule || r.title === oldRule.title);
            let newSelected = prev.selectedRules;

            if (isSelected) {
                newSelected = prev.selectedRules.map(r => (r === oldRule || r.title === oldRule.title) ? newRule : r);
            }

            return {
                ...prev,
                generatedRules: newGenerated,
                selectedRules: newSelected
            };
        });
    };

    // --- NAVIGATION ---

    const nextStep = () => {
        setState(prev => ({ ...prev, step: prev.step + 1 }));
        setError(null);
    };

    const prevStep = () => {
        if (state.step > 1) {
            setState(prev => ({ ...prev, step: prev.step - 1 }));
            setError(null);
        }
    };

    return {
        state,
        isLoading,
        error,
        setRant,
        generateBeliefs,
        toggleBelief,
        generateThoughts,
        toggleThought,
        generateRules,
        toggleRule,
        updateRule,
        generateActions,
        toggleAction,
        regenerateStep,
        nextStep,
        prevStep
    };
}
