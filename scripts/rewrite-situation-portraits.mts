/**
 * One-time backfill: older bibles describe the character in each situation
 * (users/{uid}.bible.style.situations[].portrait) in English, third person.
 * The bible compile now writes them in first person, in the user's language,
 * and the Mirror's portrait sheet shows them to the user. This rewrites the
 * older ones the same way, keeping every detail. Labels, ids, the week and
 * the avatars are left as they are.
 *
 * List the users that would be rewritten (no AI calls, nothing written):
 *   npx tsx scripts/rewrite-situation-portraits.mts --before 2026-10-18
 * Rewrite one user and print the result, without writing:
 *   npx tsx scripts/rewrite-situation-portraits.mts --before 2026-10-18 --uid <uid>
 * Write (all users, or one with --uid):
 *   npx tsx scripts/rewrite-situation-portraits.mts --before 2026-10-18 --apply
 *
 * --before is when the first-person compile was deployed: bibles compiled
 * after it (bible.last_updated) already have first-person portraits.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { generateWithFallback } from '../functions/src/lib/ai/models.js';
import type { Situation } from '../functions/src/lib/character/situations.js';

const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
};
const apply = process.argv.includes('--apply');
const onlyUid = arg('--uid');
const before = Date.parse(arg('--before') || '');
if (!Number.isFinite(before)) { console.error('Missing or invalid --before <date>'); process.exit(1); }

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) { console.error('Missing FIREBASE_SERVICE_ACCOUNT_KEY'); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
const db = getFirestore();

const LANGUAGE_NAMES: Record<string, string> = { es: 'Spanish', pt: 'Portuguese', fr: 'French', de: 'German' };
const languageName = (locale: string) => LANGUAGE_NAMES[locale] || 'English';

const SCHEMA = z.object({
    portraits: z.array(z.object({
        place: z.string().describe("The place id, unchanged"),
        portrait: z.string(),
    })),
});

/** The situations with their portraits rewritten, or null when the answer is missing any. */
async function rewrite(situations: Situation[], locale: string): Promise<Situation[] | null> {
    const places = situations.map(s => `- ${s.id} (${s.label}):\n${s.portrait}`).join('\n\n');
    const { object } = await generateWithFallback({
        abortSignal: AbortSignal.timeout(300_000),
        prompt: `These describe you in each place of your week, written about you in the third person:

${places}

Rewrite each one in the first person, in ${languageName(locale)}. Keep every detail: what you're doing, what you're wearing and the brands, grooming, your expression, and what's around you. Add nothing.`,
        schema: SCHEMA,
    });
    const byPlace = new Map(object.portraits.map(p => [p.place.trim(), p.portrait.trim()]));
    const rewritten = situations.map(s => ({ ...s, portrait: byPlace.get(s.id) || '' }));
    return rewritten.every(s => s.portrait.length >= 60) ? rewritten : null;
}

const docs = onlyUid
    ? [await db.collection('users').doc(onlyUid).get()]
    : (await db.collection('users').get()).docs;

const due = docs.filter(doc => {
    const bible = doc.data()?.bible;
    return Array.isArray(bible?.style?.situations) && bible.style.situations.length > 0
        && typeof bible.last_updated === 'number' && bible.last_updated < before;
});
console.log(`${due.length} of ${docs.length} users have portraits from before ${new Date(before).toISOString()}`);

// Without --apply or --uid, only list them: no AI calls.
if (!apply && !onlyUid) {
    for (const doc of due) console.log(`  ${doc.id} (${doc.data()?.preferred_locale || 'en'}, ${doc.data()?.bible.style.situations.length} situations)`);
    process.exit(0);
}

let written = 0;
for (const doc of due) {
    const data = doc.data()!;
    const situations = data.bible.style.situations as Situation[];
    const locale = data.preferred_locale || 'en';
    try {
        const rewritten = await rewrite(situations, locale);
        if (!rewritten) { console.log(`  ! ${doc.id}: answer missing a portrait; left as is`); continue; }
        if (!apply) {
            for (const s of rewritten) console.log(`\n[${s.id}] ${s.label}\n${s.portrait}`);
            continue;
        }
        // Re-read inside a transaction so a compile that ran meanwhile wins.
        await db.runTransaction(async tx => {
            const fresh = (await tx.get(doc.ref)).data();
            if (fresh?.bible?.last_updated !== data.bible.last_updated) throw new Error('bible changed meanwhile');
            tx.update(doc.ref, { 'bible.style.situations': rewritten });
        });
        written++;
        console.log(`  ${doc.id}: ${rewritten.length} portraits rewritten (${languageName(locale)})`);
    } catch (error) {
        console.log(`  ! ${doc.id}: ${error instanceof Error ? error.message : error}; left as is`);
    }
}
if (apply) console.log(`${written} users written`);
