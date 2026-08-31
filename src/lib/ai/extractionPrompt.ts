/**
 * Builds the prompt for extracting structured profile data from a session transcript.
 * This runs after every session to auto-populate the unified profile.
 */
export function buildExtractionPrompt(currentProfile: any, currentDossier: string, transcript: string, existingWants: string[] = []): string {
    return `You are extracting factual information and updating a living dossier from a therapy-style conversation transcript.

Your job: 
1. Produce the COMPLETE, RECONCILED people array — every person in their life as you understand them, merging what you already knew with what you just learned.
2. Identify NEW interests and wardrobe items (additive only).
3. Rewrite the structured life facts, routines, and milestones fields to incorporate any new information.
4. Rewrite the user's narrative DOSSIER to incorporate any new dates or routine changes.
5. Produce the COMPLETE, CONSOLIDATED wants list — merge existing wants with any new desires from this session.

CURRENT PROFILE (Structured Data):
${JSON.stringify(currentProfile || {}, null, 2)}

CURRENT DOSSIER (Narrative):
${currentDossier || 'No existing dossier.'}

CURRENT WANTS LIST:
${existingWants.length > 0 ? existingWants.map((w, i) => `${i + 1}. ${w}`).join('\n') : 'No existing wants.'}

═══ RULES FOR PEOPLE — COMPLETE RECONCILED LIST ═══

You are producing the ENTIRE people array, not just new additions. Every person in the user's life should appear in your output.

NEVER DROP: If a person was in the previous array and was not explicitly said to be out of the user's life, they MUST appear in your output. "Not mentioned in this session" is NOT a reason to remove someone.

RECONCILE: If someone was previously referred to generically ("my oldest daughter", "Daughter 1") and now has a name, unify them into ONE entry using the real name. Remove the placeholder.

DISAMBIGUATE: If two different people share the same name, use the "relationship" and "notes" fields to distinguish them. Example: two entries for "Iris" — one with relationship "daughter" and one with relationship "friend from work." NEVER merge two genuinely different people into one entry.

EMOTIONAL TRUTH: Record the EMOTIONAL TRUTH of relationships — if a user says their daughter hates their sister, record that. Do NOT idealize or sanitize.

WHEN IN DOUBT, PRESERVE: If a pronoun reference is ambiguous and you cannot confidently determine who the user is talking about, note the ambiguity in the "notes" field rather than making a destructive guess.

═══ RULES FOR STRUCTURED FIELDS ═══

- Only extract things the USER explicitly said about their own life.
- Do NOT extract the consultant's analysis or opinions.
- For interests, produce the COMPLETE reconciled interests list — things the USER PERSONALLY enjoys, not just new additions. Merge existing interests with any new ones from this session. Remove duplicates and consolidate similar entries. Extract specific things ("cookies", "running", "jazz music"), not vague sentiments. CRITICAL: Do NOT include activities that are primarily someone else's interest (e.g., a child's favorite activity at an amusement park). Only include things the user took to or watched because their kid likes them if the user ALSO expressed genuine personal enjoyment. Remove items the user said they no longer enjoy or have stopped doing.
- For wardrobe, extract specific clothing items the USER owns, wears, or is buying FOR THEMSELVES — not items they are buying for others (children, spouse, gifts). Produce the COMPLETE reconciled wardrobe list, not just new additions. Remove duplicates and items the user said they got rid of.
- For people, include pets.

LIFE FACTS REWRITE: Produce the complete rewritten "life_facts" field — location, occupation, employer, living situation, relationship status, and any other concrete facts about their current life. Incorporate new information from this session while preserving all existing facts unless explicitly contradicted.

ROUTINES REWRITE: Produce the complete rewritten "routines" field — daily patterns, schedules, exercise habits, work schedule, rituals. Incorporate new information while preserving existing facts.

MILESTONES REWRITE: Produce the complete rewritten "milestones" field — sobriety dates, career events, moves, life transitions. Incorporate new information while preserving existing facts.

═══ RULES FOR DOSSIER REWRITE ═══
- The rewritten dossier MUST be concise (under 1500 words).
- The dossier should contain these seven sections: PROFILE, KEY PEOPLE, BACKSTORY, WANTS & DESIRES, IMPORTANT DATES, ROUTINES & HABITS, PREFERENCES & TASTES.

═══ RULES FOR WANTS — COMPLETE CONSOLIDATED LIST ═══
- You are producing the ENTIRE wants list, not just new additions. Merge the existing wants with any new desires expressed in this session.
- CONSOLIDATE: Remove duplicates, merge similar desires into single clear statements, and remove wants the user explicitly said they no longer care about or that have been fulfilled.
- Keep the list tight and meaningful — no redundancy. Each entry should be a distinct, concrete desire.
- Do NOT store wants in the structured profile arrays — they go into a separate "all_wants" field.

CHAT TRANSCRIPT:
${transcript}

Produce the complete reconciled output in the structured format specified.`;
}
