import { useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { MASTER_BELIEFS } from '@/lib/constants/beliefs';
import { RecastMode, RecastState, Driver, Vision, Rule, Patch } from '@/types/recast';

// --- HOOK ---

export function useRecastWizard(mode: RecastMode = 'PROBLEM') {
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [state, setState] = useState<RecastState>({
        mode: mode,
        step: 1,
        input_text: "",
        calibration: { title: "", summary: "" },
        generatedDrivers: [],
        selectedDrivers: [],
        generatedVision: [],
        selectedVision: [],
        patch: null,
        selectedRules: [],
        generatedActions: [],
        selectedActions: [],
    });

    // --- GENERIC API CALLER ---

    const callApi = useCallback(async (apiMode: string, payload: any) => {
        if (!user) {
            setError("User not authenticated");
            return null;
        }
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/recast', {
                method: 'POST',
                body: JSON.stringify({ mode: apiMode, recastMode: state.mode, uid: user.uid, ...payload }),
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
    }, [user, state.mode]);

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

    const setInputText = (text: string) => setState(prev => ({ ...prev, input_text: text }));
    const setRant = setInputText; // Alias for backward compatibility if needed

    // HELPER: Map strings to Driver Objects
    const mapDrivers = (driverStrings: string[]): Driver[] => {
        return driverStrings.map(s => {
            if (state.mode === 'PROBLEM') {
                const found = MASTER_BELIEFS.find(b => b.negative === s);
                return found ?
                    { id: found.negative, type: 'BELIEF', negative: found.negative, positive: found.positive } :
                    { id: s, type: 'BELIEF', negative: s, positive: "I am Free." };
            } else {
                return { id: s, type: 'EMOTION' };
            }
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

    // STEP 1 -> 2: DIAGNOSIS (Beliefs or Emotions)
    const generateDiagnosis = async () => {
        if (!state.input_text.trim()) return;

        const result = await callApi('diagnosis', { rant: state.input_text });
        if (result?.drivers) {
            // result.drivers is string[]
            const mappedDrivers = mapDrivers(result.drivers);

            setState(prev => ({
                ...prev,
                generatedDrivers: mappedDrivers,
                step: 2
            }));
        }
    };
    // Alias for backward compatibility
    const generateBeliefs = generateDiagnosis;

    const toggleDriver = (driver: Driver) => {
        setState(prev => {
            const exists = prev.selectedDrivers.find(d => d.id === driver.id);
            if (exists) {
                return { ...prev, selectedDrivers: prev.selectedDrivers.filter(d => d.id !== driver.id) };
            }
            if (prev.selectedDrivers.length >= 3) return prev; // Max 3
            return { ...prev, selectedDrivers: [...prev.selectedDrivers, driver] };
        });
    };
    // Alias
    const toggleBelief = (belief: any) => toggleDriver({ id: belief.negative, type: 'BELIEF', ...belief });

    // STEP 2 -> 3: CONFIRM THE SHIFT (UI Transition only, no API)
    // The UI handles this transition once drivers are selected.

    // STEP 3 -> 4: GENERATE VISION (Was Thoughts)
    const generateVision = async () => {
        if (state.selectedDrivers.length === 0) {
            setError("Please select at least one item to proceed.");
            return;
        }

        const result = await callApi('vision', {
            selected_drivers: state.selectedDrivers,
            rant: state.input_text,
            calibration: state.calibration
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
            rant: state.input_text
        });

        if (result?.patch) {
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
        try {
            const result = await callApi('ghost_writer', {
                rant: state.input_text
            });
            return result?.story;
        } catch (e) {
            console.error("Ghostwriter failed", e);
            return null;
        }
    };


    // --- REGENERATE ---

    const regenerateStep = async (stepNumber: number) => {
        if (stepNumber === 2) {
            generateDiagnosis();
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
        setInputText,
        setRant, // Compat alias
        generateDiagnosis,
        generateBeliefs, // Compat alias
        toggleDriver,
        toggleBelief, // Compat alias
        generateVision,
        toggleVision,
        generateConstraints,
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

