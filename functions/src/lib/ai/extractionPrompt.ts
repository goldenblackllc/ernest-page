/**
 * Builds the prompt for extracting structured profile data from a session transcript.
 * This runs after every session to auto-populate the unified profile.
 */
export function buildExtractionPrompt(currentProfile: any, currentDossier: string, transcript: string): string {
    return `You are extracting factual information and updating a living dossier from a therapy-style conversation transcript.

Your job: 
1. Produce the COMPLETE, RECONCILED people array — every person in their life as you understand them, merging what you already knew with what you just learned.
2. Produce the COMPLETE reconciled interests and wardrobe lists.
3. Rewrite the structured life facts, routines, and milestones fields to incorporate any new information.
4. Rewrite the user's narrative DOSSIER to incorporate any new information.

CURRENT PROFILE (Structured Data):
${JSON.stringify(currentProfile || {}, null, 2)}

CURRENT DOSSIER (Narrative):
${currentDossier || 'No existing dossier.'}

═══ RULES FOR PEOPLE — TOP 40, FRESHLY SUMMARIZED ═══

Produce the reconciled people array — the 40 MOST SIGNIFICANT people and pets in the user's life. Significance means: immediate family, partner, children, close friends, business partners, and anyone the user discusses with emotional weight. Peripheral one-time mentions (e.g., a child's friend mentioned once) may be dropped if the list exceeds 40.

RECONCILE: If someone was previously referred to generically ("my oldest daughter", "Daughter 1") and now has a name, unify them into ONE entry using the real name. Remove the placeholder.

DISAMBIGUATE: If two different people share the same name, use the "relationship" field to distinguish them. NEVER merge two genuinely different people into one entry.

EMOTIONAL TRUTH: Record the EMOTIONAL TRUTH of relationships — if a user says their daughter hates their sister, record that. Do NOT idealize or sanitize.

═══ RULES FOR STRUCTURED FIELDS ═══

- Only extract things the USER explicitly said about their own life.
- Do NOT extract the consultant's analysis or opinions.
- For interests, produce the COMPLETE reconciled interests list — things the USER PERSONALLY enjoys, not just new additions. Merge existing interests with any new ones from this session. Remove duplicates and consolidate similar entries. Extract specific things ("cookies", "running", "jazz music"), not vague sentiments. CRITICAL: Do NOT include activities that are primarily someone else's interest (e.g., a child's favorite activity at an amusement park). Only include things the user took to or watched because their kid likes them if the user ALSO expressed genuine personal enjoyment. Remove items the user said they no longer enjoy or have stopped doing.
- For wardrobe, extract specific clothing items the USER owns, wears, or is buying FOR THEMSELVES — not items they are buying for others (children, spouse, gifts). Produce the COMPLETE reconciled wardrobe list, not just new additions. Remove duplicates and items the user said they got rid of.
- For people, include pets. Each person has TWO descriptive fields — rewrite BOTH freshly each session:
  • "who" — A concise summary of who this person IS right now: age, school/job, personality, interests, health, key facts. Rewrite fresh to reflect current understanding — do not accumulate old details unless still relevant.
    Example: "Junior at CCHS. Likes games, skiing, working out, and watching movies. Friends include Will and Simon."
  • "dynamic" — The OVERALL relationship between the user and this person: how they relate, the emotional quality, the stable pattern. Not session events, not a log — the current state of the relationship.
    Example: "We get along well. He's comfortable and easy with me." or "Complicated. Holds 9.6% equity in Atrium. Told his wife the user cheated him."
  Do NOT include transient session events (e.g., "picked him up from Planet Fitness today"). Only lasting facts and stable patterns.
- CROSS-REFERENCE DATES: Populate the "birthday" field for each person using any known date — from the CURRENT DOSSIER (Important Dates section), from the session transcript, or from the existing profile. If a birthday exists in the dossier but not on the person entry, add it. Format as YYYY-MM-DD or MM-DD if year is unknown.

LIFE FACTS REWRITE: Produce the complete rewritten "life_facts" field — location, occupation, employer, living situation, relationship status, and any other concrete facts about their current life. Incorporate new information from this session while preserving all existing facts unless explicitly contradicted.

ROUTINES REWRITE: Produce the complete rewritten "routines" field — daily patterns, schedules, exercise habits, work schedule, rituals. Incorporate new information while preserving existing facts.

MILESTONES REWRITE: Produce the complete rewritten "milestones" field — sobriety dates, career events, moves, life transitions. Incorporate new information while preserving existing facts.

═══ RULES FOR DOSSIER REWRITE ═══
- The rewritten dossier MUST be concise (under 1500 words).
- The dossier should contain these seven sections: PROFILE, KEY PEOPLE, BACKSTORY, WANTS & DESIRES, IMPORTANT DATES, ROUTINES & HABITS, PREFERENCES & TASTES.

CHAT TRANSCRIPT:
${transcript}

Produce the complete reconciled output in the structured format specified.`;
}
