/**
 * One-time migration: the Character Bible moves from a list of sections
 * (users/{uid}.bible.sections, or the older character_bible.compiled_output.ideal)
 * to one Markdown document in users/{uid}.bible.text. See
 * functions/src/lib/character/bibleText.ts.
 *
 * Dry run (default) reports what would change; nothing is written:
 *   npx tsx scripts/migrate-bible-text.mts
 * Write bible.text, keeping the old fields (safe while old code still runs):
 *   npx tsx scripts/migrate-bible-text.mts --apply
 * Write bible.text and remove the old fields (after the new code is deployed):
 *   npx tsx scripts/migrate-bible-text.mts --apply --cleanup
 *
 * A compile by the new code removes bible.sections, so a user who still has it
 * was last compiled by the old code and its sections are their current bible.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { joinBibleSections, splitBibleText, type BibleSection } from '../functions/src/lib/character/bibleText.js';

const apply = process.argv.includes('--apply');
const cleanup = process.argv.includes('--cleanup');
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) { console.error('Missing FIREBASE_SERVICE_ACCOUNT_KEY'); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
const db = getFirestore();

/** Sections with a heading and content; null when any entry has another shape. */
function readSections(list: unknown): BibleSection[] | null {
    if (!Array.isArray(list) || list.length === 0) return null;
    const sections = list.map(e => (
        e && typeof e.heading === 'string' && typeof e.content === 'string' ? { heading: e.heading.trim(), content: e.content.trim() } : null
    ));
    return sections.every(Boolean) ? sections as BibleSection[] : null;
}

const counts = { users: 0, fromSections: 0, fromLegacy: 0, alreadyText: 0, unreadable: 0, notRoundTrip: 0, cleaned: 0 };
const problems: string[] = [];
let batch = db.batch();
let pending = 0;

const users = await db.collection('users').get();
for (const doc of users.docs) {
    counts.users++;
    const data = doc.data();
    const hasSections = data.bible?.sections !== undefined;
    const hasLegacy = data.character_bible?.compiled_output !== undefined;
    const existing = typeof data.bible?.text === 'string' && data.bible.text ? data.bible.text : null;
    if (!hasSections && !hasLegacy && !existing) continue;

    // Current sections win; the legacy list only counts when there is nothing newer.
    let sections: BibleSection[] | null = null;
    if (hasSections) {
        sections = readSections(data.bible.sections);
        if (sections) counts.fromSections++;
    } else if (!existing && hasLegacy) {
        sections = readSections(data.character_bible.compiled_output?.ideal);
        if (sections) counts.fromLegacy++;
    } else if (existing) {
        counts.alreadyText++;
    }

    let text = existing;
    if (sections) {
        text = joinBibleSections(sections);
        const back = splitBibleText(text);
        if (back.length !== sections.length || back.some((s, i) => s.heading !== sections![i].heading || s.content !== sections![i].content)) {
            counts.notRoundTrip++;
            problems.push(`${doc.id}: does not split back into the same ${sections.length} sections (a "## " line inside a section?)`);
        }
    } else if (hasSections || (hasLegacy && !existing)) {
        counts.unreadable++;
        problems.push(`${doc.id}: old bible has an unexpected shape; left as is`);
    }

    const update: Record<string, unknown> = {};
    if (text && text !== existing) update['bible.text'] = text;
    // Only remove the old fields once the document has a bible.text.
    if (cleanup && text && (hasSections || hasLegacy)) {
        if (hasSections) update['bible.sections'] = FieldValue.delete();
        if (hasLegacy) update['character_bible.compiled_output'] = FieldValue.delete();
        counts.cleaned++;
    }
    if (apply && Object.keys(update).length > 0) {
        batch.update(doc.ref, update);
        if (++pending === 400) {
            await batch.commit();
            batch = db.batch();
            pending = 0;
        }
    }
}
if (apply && pending > 0) await batch.commit();

console.log(`${counts.users} users${apply ? '' : ' (dry run, nothing written)'}`);
console.log(`  bible.text from bible.sections: ${counts.fromSections}`);
console.log(`  bible.text from character_bible.compiled_output: ${counts.fromLegacy}`);
console.log(`  already had bible.text only: ${counts.alreadyText}`);
console.log(`  unreadable old bible: ${counts.unreadable}`);
console.log(`  not round-tripping: ${counts.notRoundTrip}`);
if (cleanup) console.log(`  old fields ${apply ? 'removed' : 'to remove'}: ${counts.cleaned}`);
for (const p of problems) console.log(`  ! ${p}`);
