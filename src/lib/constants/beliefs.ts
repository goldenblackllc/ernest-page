export const MASTER_BELIEFS = [
    // Identity (The "I" Glitches)
    {
        negative: "I am Powerless.",
        positive: "I am the Creator.",
        description: "Feeling stuck, trapped, forced.",
        category: "Identity"
    },
    {
        negative: "I am Restricted.",
        positive: "I am free.",
        description: "Feeling blocked, limited, held back.",
        category: "Identity"
    },
    {
        negative: "I am Not Enough.",
        positive: "I am complete.",
        description: "Feeling inadequate, failing a role, insecure.",
        category: "Identity"
    },
    {
        negative: "I am Unsafe.",
        positive: "I am secure.",
        description: "Feeling danger, fear, liability.",
        category: "Identity"
    },
    {
        negative: "I am Disconnected.",
        positive: "I am connected.",
        description: "Feeling lonely, misunderstood, isolated.",
        category: "Identity"
    },
    // Reality (The "World" Glitches)
    {
        negative: "Life is Hard.",
        positive: "Life is effortless.",
        description: "Feeling struggle, burden, exhaustion.",
        category: "Reality"
    },
    {
        negative: "Life is Scarce.",
        positive: "Life is abundant.",
        description: "Feeling lack of money/time, fear of running out.",
        category: "Reality"
    },
    {
        negative: "Life is Dangerous.",
        positive: "Life is safe.",
        description: "Feeling hostility, mistrust, threat.",
        category: "Reality"
    },
    {
        negative: "Life is Unfair.",
        positive: "Life is just.",
        description: "Feeling victimhood, resentment, injustice.",
        category: "Reality"
    },
    {
        negative: "Life is Joyless.",
        positive: "Life is play.",
        description: "Feeling boredom, drudgery, lack of fun.",
        category: "Reality"
    }
];

export type CoreBelief = typeof MASTER_BELIEFS[number];
