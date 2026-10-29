/**
 * The ways into a new belief that the Mirror can use (DEPARTURE Step 2), plus
 * the paths a session can take instead. processChat records one per session
 * recap; the next session's prompt shows them so the character can vary the
 * way in.
 */

export const WAYS_IN = {
    feel_it_now: 'Feel it now',
    preferred_you_replay: 'Preferred-you replay',
    role_model: 'Role model',
    advice_to_others: 'Advice to others',
    two_sets_of_actions: 'Two sets of actions',
    act_as_if: 'Act as if',
    magic_lamp: 'Magic lamp',
    excitement_scan: 'Excitement scan',
    excitement_compass: 'Excitement compass',
    none: 'None',
} as const;

export type WayIn = keyof typeof WAYS_IN;

export const WAY_IN_IDS = Object.keys(WAYS_IN) as [WayIn, ...WayIn[]];

/** The label shown after a recap, e.g. " [Way in: Magic lamp]"; empty for unknown or missing. */
export function wayInSuffix(wayIn: unknown): string {
    return typeof wayIn === 'string' && wayIn in WAYS_IN ? ` [Way in: ${WAYS_IN[wayIn as WayIn]}]` : '';
}
