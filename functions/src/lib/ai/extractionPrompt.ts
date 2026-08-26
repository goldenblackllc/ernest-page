/**
 * Builds the prompt for extracting structured profile data from a session transcript.
 * This runs after every session to auto-populate the unified profile.
 */
export function buildExtractionPrompt(currentProfile: any, currentDossier: string, transcript: string): string {
    return `You are extracting factual information and updating a living dossier from a therapy-style conversation transcript.

Your job: 
1. Identify NEW facts about the user for the structured database arrays (people, interests, wardrobe).
2. Rewrite the user's narrative DOSSIER to seamlessly incorporate any new life facts, routines, or backstory elements, removing outdated information.

CURRENT PROFILE (Arrays):
${JSON.stringify(currentProfile || {}, null, 2)}

CURRENT DOSSIER (Narrative):
${currentDossier || 'No existing dossier.'}

RULES FOR DOSSIER REWRITE:
- The rewritten dossier MUST be highly concise and punchy (maximum 1 page).
- Do NOT include 'Key People' or 'Preferences & Tastes' sections in the dossier, those belong in the structured arrays.
- Keep the existing ═══ SECTION ═══ formatting for Profile, Backstory, Wants & Desires, and Routines.
- Update the 'Updated:' date to today.

RULES FOR STRUCTURED ARRAYS:
- Only extract things the USER explicitly said about their own life.
- Record the EMOTIONAL TRUTH of relationships — if a user says their daughter hates their sister, record that. Do NOT idealize.
- Do NOT extract the consultant's analysis or opinions.
- Do NOT extract wants/desires/goals for the structured arrays — these go into 'wants_for_bible'.
- For interests, extract specific things they enjoy ("cookies", "running", "jazz music"), not vague sentiments.
- For wardrobe, extract specific clothing items mentioned ("blue suit", "running shoes").
- For people, include pets.
- Only include data that is NEW or UPDATED — do not repeat existing profile data unchanged.

CHAT TRANSCRIPT:
${transcript}

Extract any new or updated information in the structured format specified, and output the fully rewritten dossier.`;
}
