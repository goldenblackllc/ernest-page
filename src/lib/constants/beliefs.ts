export const MASTER_BELIEFS = [
    // Identity (The "I" Glitches)
    {
        negative: "I am powerless.",
        positive: "I am in complete control.",
        description: "Feeling stuck, trapped, forced.",
        category: "Identity"
    },
    {
        negative: "I am a victim.",
        positive: "I create the life I want.",
        description: "Feeling targeted, persecuted, at the mercy of others.",
        category: "Identity"
    },
    {
        negative: "I am not enough.",
        positive: "I am more than enough.",
        description: "Feeling inadequate, failing a role, insecure.",
        category: "Identity"
    },
    {
        negative: "I am empty.",
        positive: "I am overflowing.",
        description: "Feeling void, hollow, lacking substance.",
        category: "Identity"
    },
    {
        negative: "I am a fraud.",
        positive: "I am the real deal.",
        description: "Feeling fake, imposter syndrome, hiding.",
        category: "Identity"
    },
    {
        negative: "I am unloved.",
        positive: "I am loved.",
        description: "Feeling rejected, abandoned, unwanted.",
        category: "Identity"
    },
    {
        negative: "I am unlovable.",
        positive: "I am loved.",
        description: "Feeling inherently defective, unworthy of connection.",
        category: "Identity"
    },
    {
        negative: "I am not important.",
        positive: "I am very important.",
        description: "Feeling insignificant, small, irrelevant.",
        category: "Identity"
    },
    {
        negative: "I am invisible.",
        positive: "I am uniquely important.",
        description: "Feeling unseen, overlooked, ghost-like.",
        category: "Identity"
    },
    {
        negative: "I am a bad person.",
        positive: "I am an amazing person.",
        description: "Feeling guilty, shameful, morally wrong.",
        category: "Identity"
    },
    {
        negative: "I am poison.",
        positive: "I bring joy to the world.",
        description: "Feeling toxic, harmful to others.",
        category: "Identity"
    },
    {
        negative: "I cannot express myself fully.",
        positive: "I easily express myself and live the life I want.",
        description: "Feeling choked, silenced, misrepresented.",
        category: "Identity"
    },
    {
        negative: "I am silenced.",
        positive: "I am extremely important.",
        description: "Feeling suppressed, ignored, without a voice.",
        category: "Identity"
    },
    {
        negative: "I am suffocating.",
        positive: "Life is easy.",
        description: "Feeling crushed, overwhelmed, unable to breathe.",
        category: "Identity"
    },
    {
        negative: "I am broken.",
        positive: "I am absolutely perfect.",
        description: "Feeling damaged, glitchy, functioning incorrectly.",
        category: "Identity"
    },
    {
        negative: "I am incompetent.",
        positive: "I am highly skilled.",
        description: "Feeling incapable, skill-less, unable to cope.",
        category: "Identity"
    },
    {
        negative: "I always fail.",
        positive: "I am successful.",
        description: "Feeling doomed, cursed, patterned for defeat.",
        category: "Identity"
    },
    // Reality (The "World" Glitches)
    {
        negative: "Life is hard.",
        positive: "I really enjoy being alive.",
        description: "Feeling struggle, burden, exhaustion.",
        category: "Reality"
    },
    {
        negative: "Life is a punishment.",
        positive: "Life is an opportunity to enjoy myself.",
        description: "Feeling persecuted by the universe, karma, bad luck.",
        category: "Reality"
    },
    {
        negative: "Life is not enjoyable.",
        positive: "I enjoy being alive.",
        description: "Feeling boredom, drudgery, lack of fun.",
        category: "Reality"
    }
];

export type CoreBelief = typeof MASTER_BELIEFS[number];
