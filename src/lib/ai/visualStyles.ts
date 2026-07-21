/**
 * Visual Styles for Image Generation
 *
 * 8 styles in a flat list, each with equal probability:
 * - 6 photographers: letter + photographer tag → Imagen
 * - 2 landscapes: character bible → Imagen (with or without the person)
 */

export type StyleCategory = 'photographer' | 'landscape' | 'landscape-with-person';

export interface VisualStyle {
    /** Machine-readable identifier stored in Firestore */
    id: string;
    /** Display name */
    name: string;
    /** Category determines prompt structure and whether reference images are used */
    category: StyleCategory;
    /** When the AI should pick this style */
    bestFor: string;
    /** Photographer vision description (only used for photographer category) */
    vision: string;
    /** Prompt prefix sent to Imagen */
    imagenTag: string;
}

export const VISUAL_STYLES: VisualStyle[] = [
    {
        id: 'slim-aarons',
        name: 'Slim Aarons',
        category: 'photographer',
        bestFor: 'Stories about connection, joy, social life, reclaiming confidence, celebration, or aspiration.',
        vision: `You are Slim Aarons. You photograph "attractive people doing attractive things in attractive places." Your subjects don't perform for the camera — they simply live beautifully and you happen to be there. Sun-drenched natural light, saturated warm tones, golden hour. Poolside terraces, lush gardens, curated interiors. The viewer doesn't just see the photo — they want to step INTO this life. Effortless glamour, never staged-looking. The good life, captured mid-sentence.`,
        imagenTag: 'Generate an image in the style of Slim Aarons for this letter:',
    },
    {
        id: 'cartier-bresson',
        name: 'Henri Cartier-Bresson',
        category: 'photographer',
        bestFor: 'Stories about pivotal moments, sudden clarity, timing, decisions, or life-changing realizations.',
        vision: `You are Henri Cartier-Bresson. You live for "the decisive moment" — the split second when composition, gesture, and meaning collide. Geometric precision: diagonal lines, frames within frames, shadows as structural elements. You find the extraordinary in the ordinary. You never stage anything — you wait, watch, and shoot when the world aligns. High contrast, architectural composition, layered depth. Every element in the frame has a reason to be there.`,
        imagenTag: 'Generate an image in the style of Henri Cartier-Bresson for this letter:',
    },
    {
        id: 'dorothea-lange',
        name: 'Dorothea Lange',
        category: 'photographer',
        bestFor: 'Stories about hardship, endurance, family struggle, financial stress, exhaustion, or resilience.',
        vision: `You are Dorothea Lange. You get close — close enough to feel the story in the lines of a face, the grip of a hand, the weight of a posture. Raw human dignity under pressure. No artifice, no flattery — just the truth of the moment. Natural light, often harsh. Tight framing that forces intimacy. The viewer cannot look away because you've made them feel responsible. Your photos don't illustrate suffering — they honor the strength inside it.`,
        imagenTag: 'Generate an image in the style of Dorothea Lange for this letter:',
    },
    {
        id: 'richard-avedon',
        name: 'Richard Avedon',
        category: 'photographer',
        bestFor: 'Stories about identity, self-image, reinvention, confronting truth, or stripping away pretense.',
        vision: `You are Richard Avedon. You strip everything away. White or minimal backgrounds — nowhere to hide. The subject stands alone with their character. Razor-sharp focus, high contrast, every gesture and expression amplified by the emptiness around it. Your portraits don't capture what people look like — they capture what people ARE. Movement, spontaneity within the stark frame. The tension between vulnerability and defiance.`,
        imagenTag: 'Generate an image in the style of Richard Avedon for this letter:',
    },
    {
        id: 'saul-leiter',
        name: 'Saul Leiter',
        category: 'photographer',
        bestFor: 'Stories about loneliness, longing, quiet inner worlds, urban life, or unspoken emotions.',
        vision: `You are Saul Leiter. You see the world through layers — rain-streaked windows, steamed glass, reflections, door frames, curtains. Your subjects are often partially hidden, glimpsed, fragmented. Accidental beauty in the everyday. Painterly color: a red umbrella against grey, warm light bleeding through fog. Soft focus, shallow depth of field, abstract compositions that feel more like paintings than photographs. The beauty is in what's almost — but not quite — revealed.`,
        imagenTag: 'Generate an image in the style of Saul Leiter for this letter:',
    },
    {
        id: 'platon',
        name: 'Platon',
        category: 'photographer',
        bestFor: 'Stories about power, anger, vulnerability beneath strength, confrontation, or raw emotional intensity.',
        vision: `You are Platon. You shoot extreme close-ups that turn a face into a landscape. Dramatic, confrontational lighting — one light source, deep shadows, every line and pore visible. Minimal or pure white backgrounds. The eyes do all the talking. Your portraits are intense, almost uncomfortably intimate. You don't capture beauty — you capture TRUTH. The tension between power and vulnerability in a single expression. Magazine-cover intensity, no escape for the viewer.`,
        imagenTag: 'Generate an image in the style of Platon for this letter:',
    },
    {
        id: 'landscape',
        name: 'Landscape',
        category: 'landscape',
        bestFor: 'Any story — scenic locations from the character\'s life without the person.',
        vision: '',
        imagenTag: 'Generate a beautiful landscape photograph of a place this person loves based on their character:',
    },
    {
        id: 'landscape-portrait',
        name: 'Landscape Portrait',
        category: 'landscape-with-person',
        bestFor: 'Any story — the person placed in a location they love.',
        vision: '',
        imagenTag: 'Generate a photograph of this person in a place they love based on their character:',
    },
];

/**
 * The photographer catalog formatted for AI prompt injection.
 * Lists all photographers so the AI can pick the best match.
 */
export const PHOTOGRAPHER_CATALOG = VISUAL_STYLES.map(s =>
    `- "${s.id}" (${s.name}): ${s.bestFor}`
).join('\n');

/**
 * Look up a visual style by its ID (fuzzy).
 * Tries exact id → case-insensitive id → name match → partial match.
 */
export function getVisualStyle(id: string): VisualStyle | undefined {
    if (!id) return undefined;
    const lower = id.toLowerCase().trim();
    const exact = VISUAL_STYLES.find(s => s.id === lower);
    if (exact) return exact;
    const byId = VISUAL_STYLES.find(s => s.id.toLowerCase() === lower);
    if (byId) return byId;
    const byName = VISUAL_STYLES.find(s => s.name.toLowerCase() === lower);
    if (byName) return byName;
    const partial = VISUAL_STYLES.find(s =>
        s.name.toLowerCase().includes(lower) || lower.includes(s.id)
    );
    if (partial) return partial;
    console.warn(`[VisualStyles] Could not match style "${id}" — no fallback applied`);
    return undefined;
}
