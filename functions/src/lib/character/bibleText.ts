/**
 * The Character Bible is one Markdown document, stored in users/{uid}.bible.text:
 * seven sections, each starting with a "## <Heading>" line, each made of
 * "**Subheading:**" subsections. The headings are always these English names,
 * whatever language the content is in.
 *
 * Pure, no imports; shared with the website (Profile).
 */

export const BIBLE_HEADINGS = [
    'Style & Presence',
    'Daily Life & Habits',
    'People & Connections',
    'The Inner Mind',
    'Quirks & Details',
    'Order & Sanctuary',
    'The World I Love',
] as const;

export interface BibleSection {
    heading: string;
    content: string;
}

/** "## 3. **People and Connections**" and "People & Connections" compare equal. */
const headingKey = (heading: string) => heading.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');

/**
 * Split a bible document into its "## " sections, in document order. A heading
 * that names one of BIBLE_HEADINGS loosely is returned with the exact name.
 * Text before the first heading is dropped.
 */
export function splitBibleText(text: string): BibleSection[] {
    const sections: BibleSection[] = [];
    const parts = (text || '').split(/^##[ \t]+(.+)$/m);
    for (let i = 1; i < parts.length; i += 2) {
        const raw = parts[i].trim();
        const known = BIBLE_HEADINGS.find(h => headingKey(h) === headingKey(raw));
        sections.push({ heading: known || raw.replace(/\*\*/g, '').trim(), content: (parts[i + 1] || '').trim() });
    }
    return sections;
}

/** Join sections into a bible document. */
export function joinBibleSections(sections: BibleSection[]): string {
    return sections.map(s => `## ${s.heading}\n\n${s.content.trim()}`).join('\n\n');
}

/**
 * Split one section into its "**Subheading:**" subsections. Accepts the colon
 * inside or outside the bold. Text before the first subheading is dropped.
 */
export function splitSubsections(content: string): { title: string; content: string }[] {
    const parts = (content || '').split(/\*\*([^*]+?)(?::\*\*|\*\*:)/);
    const subsections: { title: string; content: string }[] = [];
    for (let i = 1; i < parts.length; i += 2) {
        subsections.push({ title: parts[i].trim(), content: (parts[i + 1] || '').trim() });
    }
    return subsections;
}
