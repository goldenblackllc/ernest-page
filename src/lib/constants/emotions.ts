export const MASTER_EMOTIONS = [
    "Significance",
    "Connection",
    "Contribution",
    "Growth",
    "Certainty",
    "Variety",
    "Freedom",
    "Power",
    "Peace",
    "Clarity"
];

// Helper to check validity or get details if we expanded this object later
export const isValidEmotion = (emotion: string) => MASTER_EMOTIONS.includes(emotion);
