/**
 * Builds the prompt for generating a session log entry.
 * Purpose: give the character enough context for coherent follow-up conversations.
 * Records what was discussed — NOT emotional trajectories or psychological analysis.
 */
export function buildSessionLogPrompt(transcript: string): string {
    return `Write a 2-3 sentence summary of what was discussed in this session. Be factual and specific.

RULES:
- Record WHAT was discussed, not how the user felt or how they're progressing.
- Do NOT track "emotional arcs" or "trajectories" — each session is a fresh moment.
- Do NOT write psychological observations about the user.
- Include specific topics, decisions, or action items.
- Write from a neutral, factual perspective.

Examples of GOOD summaries:
- "Discussed upcoming job interview at Acme Corp. Decided to prepare by rehearsing key stories. Also mentioned daughter's birthday is next week."
- "Talked about wanting to start a morning workout routine. Mentioned owning a home gym. Explored outfit options for a business dinner."

Examples of BAD summaries (do NOT write like this):
- "User is gaining confidence and overcoming their fear of rejection."
- "Continued pattern of avoiding difficult conversations with spouse."

CHAT TRANSCRIPT:
${transcript}`;
}
