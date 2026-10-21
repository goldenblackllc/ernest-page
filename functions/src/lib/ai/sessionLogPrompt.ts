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

ALSO RECORD THE WAY IN (way_in) — how the session got the person into the new belief, if it did. Pick exactly one:
${WAY_IN_GUIDE}

CHAT TRANSCRIPT:
${transcript}`;
}

const WAY_IN_GUIDE = `- feel_it_now: asked what they would feel if the new belief were true, and they went into the feeling
- preferred_you_replay: replayed a specific moment from the session with the preferred self handling it
- role_model: had them describe someone they admire and what that person feels
- two_sets_of_actions: laid the old belief's actions beside the new belief's actions, side by side
- act_as_if: had them act it out — posture, saying "I am…" out loud
- magic_lamp: asked who they would be if they had a magic lamp
- excitement_scan: the embodiment did not land, so it fell back to finding the most exciting available option
- excitement_compass: no belief work; they listed their options and committed to the most exciting one
- none: the session never got to any of these
If several were used, pick the one that landed.`;
