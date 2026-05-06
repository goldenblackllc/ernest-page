/**
 * Shared dossier rewrite prompt — single source of truth.
 * Used by cleanup-chats cron and the standalone dossier/update endpoint.
 */
export function buildDossierPrompt(currentDossier: string, sessionCount: number): string {
    return `You are maintaining an intelligence briefing on a person. Your mission: someone who has never met this person should be able to read this dossier and immediately understand who they are, what they do, who matters to them, and where they are in life.

CURRENT DOSSIER:
${currentDossier}

WHAT COUNTS AS A FACT:
- Only extract things the USER explicitly said about their own life: people, places, jobs, businesses, living situation, preferences, hobbies, goals, habits, history, desires, and concrete events.
- Do NOT extract the consultant's analysis, opinions, or observations about the user's behavior or communication style.
- Do NOT include session dynamics, meta-commentary about the conversation itself, or editorial analysis.
- If in doubt, ask: "Did the user tell me this about themselves?" If the answer is no, it does not belong in the dossier.

ANCHOR FACTS — NEVER DROP THESE:
Some facts define who a person IS. These are permanent fixtures of the dossier and must survive every rewrite regardless of space constraints:
- Businesses they own or founded
- Their career and employer
- Their children and spouse/partner
- Where they live
- Major life events (divorce, death of a loved one, relocation, sobriety)
- Anything the user has explicitly flagged as important to them
These facts can be shortened for brevity, but they can NEVER be removed. If the user told you they own a company, that fact exists in every future version of this dossier until they say otherwise.

REWRITE RULES:
- Produce a COMPLETE REWRITE of the dossier — not an append. The output replaces the current dossier entirely.
- Preserve ALL existing facts from the current dossier unless the user explicitly contradicted or corrected them in the new session. "Not mentioned in this session" is NOT a reason to remove a fact.
- DROP any behavioral observations, communication analysis, or session meta-commentary that may exist in the previous dossier. These do not belong in any section.
- The dossier must be UNDER 1500 WORDS. When space is tight, COMPRESS — shorten descriptions, use fewer words per entry. Do NOT delete facts to make room. The only facts that can be fully removed are those the user explicitly said are no longer true.
- Update session count to: ${sessionCount}
- Update date to today
- Write in a professional, structured, factual tone. Stick to what is known. Do not speculate.

Use ONLY the following section format with ═══ headers. Do not invent, rename, merge, or add any sections beyond these seven:

DOSSIER — [Client Title]
Updated: [Date] | Sessions: ${sessionCount}

═══ PROFILE ═══
Who they are right now: gender, age, location, living situation, occupation, employer, businesses owned, relationship status, life stage.

═══ KEY PEOPLE ═══
Important relationships — name, role, dynamic. Enough detail to reference naturally in conversation. Include pets if mentioned.

═══ BACKSTORY ═══
Where they came from: childhood, formative events, career history, past relationships, education, major life changes (divorce, relocation, loss). Things that shaped who they are today.

═══ WANTS & DESIRES ═══
What the user has expressed wanting — big or small, near or far. Keep all desires unless the user explicitly says they no longer want something or it was fulfilled.

═══ IMPORTANT DATES ═══
Dates the user has attached significance to: birthdays, anniversaries, milestones, losses, sobriety dates, deadlines, or any date they mention as meaningful.
Format each entry as: YYYY-MM-DD | Label | Context (e.g. 2026-06-15 | Daughter's birthday | Turning 7). Use best judgment for year if not stated. If only a month/day is given, omit the year.

═══ ROUTINES & HABITS ═══
How they spend their time: morning routine, work schedule, exercise habits, evening wind-down, weekend patterns, rituals, disciplines they maintain or are trying to build.

═══ PREFERENCES & TASTES ═══
What they enjoy: music, movies, books, food, drinks, brands, hobbies, sports teams, fashion, travel destinations, and anything else they favor.

Output the complete updated dossier as plain text.`;
}
