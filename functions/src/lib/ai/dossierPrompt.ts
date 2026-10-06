/**
 * Builds the prompts that rewrite and condense the user's dossier after each session.
 * The header line (date + session count) is written by the caller, not the model.
 */

export const DOSSIER_WORD_LIMIT = 2500;

const SECTION_BUDGETS = `Word budget per section (maximums, not targets — shorter is fine):
- PROFILE: 330
- KEY PEOPLE: 580
- BACKSTORY: 250
- WANTS & DESIRES: 330
- IMPORTANT DATES: 170
- ROUTINES & HABITS: 250
- PREFERENCES & TASTES: 330
- RIGHT NOW: 260
Total: under ${DOSSIER_WORD_LIMIT} words.`;

const KEEPING_RULES = `WHAT TO KEEP AND HOW TO FIT IT:
Decide what stays by how important a fact is to the person's life, not by whether it came up recently.
- CORE facts — spouse/partner, children, where they live, their job or business, health conditions, major ongoing projects — stay even if they were not mentioned in this session. Remove a core fact only when the user says it is no longer true.
- DETAILS — brands, restaurants, gear, shows, specific foods, small routines — compress first. Summarize lists into the gist with two or three defining examples (e.g. "Carnivore; favorites are ribeye, scallops, and bone broth" rather than every food ever named).
- RIGHT NOW items expire by date (see that section).
Move things between sections as they change:
- A RIGHT NOW item that keeps coming up for weeks becomes part of the stable sections.
- Something finished or in the past shrinks to one short BACKSTORY line or is dropped.
- Wants that were fulfilled and dates that have passed are removed.`;

const SECTIONS = `═══ PROFILE ═══
Who they are right now: gender, age, location, living situation, occupation, employer, businesses owned, relationship status, life stage.

═══ KEY PEOPLE ═══
The person keeps their own list of the people in their life, so do not write full profiles here. For each person: name and relationship in a few words, plus what is currently going on with them from conversations (school, work, health, plans). Leave out their tastes, hobbies, and personality — the person's own list covers those. Include pets.

═══ BACKSTORY ═══
Plain facts about where they came from: where they grew up, education, career history, past relationships, major moves and life events. Facts only — no interpretation of how the past shaped them.

═══ WANTS & DESIRES ═══
What the user has said they want — big or small, near or far.

═══ IMPORTANT DATES ═══
Dates the user has attached significance to: birthdays, anniversaries, milestones, deadlines, planned trips.
Format each entry as: YYYY-MM-DD | Label | Context. If only a month/day is known, omit the year.

═══ ROUTINES & HABITS ═══
How they spend their time: daily routine, work schedule, exercise, rituals, disciplines they keep or are building.

═══ PREFERENCES & TASTES ═══
What they enjoy: music, movies, books, food, drinks, brands, hobbies, clothing, travel, and anything else they favor.

═══ RIGHT NOW ═══
Short-lived items: what is happening this week, today's plans and to-dos, upcoming visits, things in progress.
- Start every entry with the date it was mentioned: YYYY-MM-DD | item. Keep an entry's original date if it is carried forward; only change the date if the user gives an update.
- Remove entries mentioned more than 14 days before today unless the user brought them up again.
- Anything pending, awaited, or in progress (waiting on a signature, a reply, a repair, a delivery) belongs ONLY here, never in the stable sections.
- Each item appears once in the whole dossier. If it is in this section, remove it from every other section.`;

export function buildDossierPrompt(currentDossier: string, transcript: string, today: string): string {
    return `You are updating a living dossier about a person from a conversation between this person and their ideal self on Earnest Page.

Today's date: ${today}

CURRENT DOSSIER:
${currentDossier || 'No existing dossier.'}

WHAT THE DOSSIER IS FOR:
The dossier lets their ideal self pick up where things are without the person having to re-explain their life each time. It holds facts about the person's life as it is right now. It does not hold their stories about the past, their struggles, or their patterns. Do not fix the person into an old version of themselves.

WHAT COUNTS AS A FACT:
- Only things the USER explicitly said about their own life: people, places, work, businesses, living situation, health, plans, wants, habits, preferences, and concrete events.
- Do NOT include the ideal self's analysis, opinions, reframes, or observations about the person.
- Do NOT include limiting beliefs, emotional patterns, "core issues", resolutions, or commentary about the conversation itself.
- If in doubt, ask: "Did the user tell me this about themselves?" If not, it does not belong.

${KEEPING_RULES}

REWRITE RULES:
- Produce a COMPLETE REWRITE of the dossier as one coherent whole, not an append. Your output replaces the current dossier entirely.
- ${SECTION_BUDGETS}
- Use ONLY the eight sections below, in this order. Do not add, rename, or merge sections. Remove any other section found in the current dossier.
- Do NOT write a title or header line above the first section — it is added automatically.
- When a date is mentioned relative to today ("this Friday", "next February"), resolve it to a full date using today's date.
- Write in a plain, factual tone. Stick to what is known. Do not speculate.

${SECTIONS}

CHAT TRANSCRIPT:
${transcript}

Output the complete updated dossier (the eight sections) as plain text.`;
}

/** Second pass, run only when a rewrite comes back over DOSSIER_WORD_LIMIT. */
export function buildDossierCondensePrompt(dossier: string, wordCount: number, today: string): string {
    return `The dossier below describes a person who has conversations with their ideal self on Earnest Page. It is ${wordCount} words, which is over the ${DOSSIER_WORD_LIMIT}-word limit. Rewrite it to fit.

Today's date: ${today}

${KEEPING_RULES}

${SECTION_BUDGETS}

Keep the same eight sections in the same order, with the same ═══ headers. Do not add a title or header line. Do not add anything new — only condense what is there.

${SECTIONS}

DOSSIER:
${dossier}

Output the complete condensed dossier (the eight sections) as plain text.`;
}
