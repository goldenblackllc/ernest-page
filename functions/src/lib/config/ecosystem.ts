export interface EcosystemAd {
    id: string;
    brand: string;
    title: string;
    headline?: string;
    body?: string;
    description?: string;
    cta: string;
    link: string;
    imageColor: string;
    imageUrl?: string;
    meta?: string;
}

// ─── Sponsor Rules ────────────────────────────────────────────────────────────
// Maps keywords in imagen_prompt → sponsor attribution on the post.
// When a post's image prompt matches any keyword pattern, the post gets
// `sponsored_by` and `sponsored_link` fields written at creation time.
export interface SponsorRule {
    /** Regex pattern tested against the imagen_prompt (case-insensitive) */
    pattern: RegExp;
    /** Display name shown as "Sponsored by {name}" */
    name: string;
    /** URL the sponsor badge links to */
    link: string;
}

export const sponsorRules: SponsorRule[] = [
    {
        pattern: /coffee|espresso|jura|crema|brew/i,
        name: "Breadstand",
        link: "https://breadstand.us",
    },
    // Future example:
    // {
    //     pattern: /cuckoo\s*clock|black\s*forest|chalet/i,
    //     name: "Partner Name",
    //     link: "https://partner.example.com",
    // },
];

/** Given an imagen prompt, return the first matching sponsor or null. */
export function matchSponsor(imagenPrompt: string | undefined): { name: string; link: string } | null {
    if (!imagenPrompt) return null;
    for (const rule of sponsorRules) {
        if (rule.pattern.test(imagenPrompt)) {
            return { name: rule.name, link: rule.link };
        }
    }
    return null;
}

// ─── Ecosystem Ads (feed interstitials) ───────────────────────────────────────
export const ecosystemAds: EcosystemAd[] = [
    {
        id: "breadstand-jura",
        brand: "Breadstand",
        title: "Stop waiting for a better morning. Demand it.",
        headline: "Stop waiting for a better morning. Demand it.",
        body: "A better life is built on better choices. Stop settling for the quick fix or the compromise cup. A Jura automatic machine is the everyday standard you deserve—flawless coffee, fresh beans, and the smart financial choice at $0.40 a cup. Take control of your daily ritual.",
        cta: "Take Control of Your Morning",
        link: "https://breadstand.us",
        imageColor: "bg-zinc-900",
        imageUrl: "/ads/breadstand1.jpeg",
        meta: "Ecosystem Partner",
    },
    {
        id: "breadstand-jura-2",
        brand: "Breadstand",
        title: "Quality isn't a luxury. It's a decision.",
        headline: "Quality isn't a luxury. It's a decision.",
        body: "You dictate the standard of your own life. Choosing an authorized Jura from BreadStand means rejecting disposable, short-term traps and investing in true Swiss engineering. It's the intentional, empowering choice that pays for itself every single day.",
        cta: "Make the Decision",
        link: "https://breadstand.us",
        imageColor: "bg-zinc-900",
        imageUrl: "/ads/breadstand2.jpeg",
        meta: "Ecosystem Partner",
    },
    {
        id: "breadstand-jura-3",
        brand: "Breadstand",
        title: "Live with purpose. Brew with precision.",
        headline: "Live with purpose. Brew with precision.",
        body: "Don't let your morning happen to you. Define it. With a Jura, there is no waiting in line, no messy filters, and zero friction. Just the absolute best, freshly ground coffee right in your kitchen, at the touch of a button. Because you shouldn't have to compromise on your everyday necessities.",
        cta: "Define Your Morning",
        link: "https://breadstand.us",
        imageColor: "bg-zinc-900",
        imageUrl: "/ads/breadstand3.jpeg",
        meta: "Ecosystem Partner",
    }
];
