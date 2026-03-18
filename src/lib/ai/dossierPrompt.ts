/**
 * Shared dossier rewrite prompt — single source of truth.
 * Used by cleanup-chats cron and the standalone dossier/update endpoint.
 */
export function buildDossierPrompt(currentDossier: string, sessionCount: number): string {
    return `You are maintaining a personal consultant's client dossier. Your job is to produce an updated dossier that captures everything important about this person.

CURRENT DOSSIER:
${currentDossier}

WHAT COUNTS AS A FACT:
- Only extract things the USER explicitly said about their own life: people, places, jobs, living situation, preferences, hobbies, goals, habits, history, desires, and concrete events.
- Do NOT extract the consultant's analysis, opinions, or observations about the user's behavior or communication style.
- Do NOT include session dynamics, meta-commentary about the conversation itself, or editorial analysis of the user's honesty or motives.
- If in doubt, ask: "Did the user tell me this about themselves?" If the answer is no, it does not belong in the dossier.

REWRITE RULES:
- Produce a COMPLETE REWRITE of the dossier — not an append. The output replaces the current dossier entirely.
- Keep all existing life facts that are still relevant. Drop anything outdated or contradicted by new information.
- DROP any behavioral observations, communication analysis, or session meta-commentary that may exist in the previous dossier. These do not belong in any section.
- Items in WANTS & DESIRES are permanent unless the user explicitly says they no longer want something or the desire was fulfilled. Do not trim desires for space.
- Items in IMPORTANT DATES are permanent unless the user explicitly corrects or removes one. Always preserve dates from previous dossiers.
- The dossier must be UNDER 1500 WORDS. If it grows beyond that, prioritize: wants & desires > important dates > key people > profile > backstory > routines > preferences. Cut the least actionable details.
- Update session count to: ${sessionCount}
- Update date to today
- Write from the consultant's perspective — professional, structured, factual. Stick to what is known. Do not speculate.

Use ONLY the following section format with ═══ headers. Do not invent, rename, merge, or add any sections beyond these seven:

DOSSIER — [Client Title]
Updated: [Date] | Sessions: ${sessionCount}

═══ PROFILE ═══
Hard facts about who they are right now: gender, age, location, living situation, occupation, employer, relationship status, life stage.

═══ KEY PEOPLE ═══
Important relationships — name, role, dynamic. Enough detail to reference naturally in conversation. Include pets if mentioned.

═══ BACKSTORY ═══
Where they came from: childhood, formative events, career history, past relationships, education, major life changes (divorce, relocation, loss). Things that shaped who they are today.

═══ WANTS & DESIRES ═══
Everything the user has expressed wanting — big or small, near or far. Keep all desires unless the user explicitly says they no longer want something or it was fulfilled. Time and urgency are irrelevant here.

═══ IMPORTANT DATES ═══
Dates the user has attached significance to: birthdays, anniversaries, milestones, losses, sobriety dates, deadlines, or any date they mention as meaningful. Extract these from conversation — the user will not announce them as "important dates," they will mention them naturally.
Format each entry as: YYYY-MM-DD | Label | Context (e.g. 2026-06-15 | Daughter's birthday | Turning 7). Use best judgment for year if not stated. If only a month/day is given, omit the year.

═══ ROUTINES & HABITS ═══
How they spend their time: morning routine, work schedule, exercise habits, evening wind-down, weekend patterns, rituals, disciplines they maintain or are trying to build.

═══ PREFERENCES & TASTES ═══
What they enjoy: music, movies, books, food, drinks, brands, hobbies, sports teams, fashion, travel destinations, and anything else they favor.

Output the complete updated dossier as plain text.`;
}
