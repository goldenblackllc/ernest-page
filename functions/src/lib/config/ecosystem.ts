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
