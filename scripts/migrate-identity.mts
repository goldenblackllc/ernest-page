/**
 * One-time migration: the three defining words (users/{uid}.defining_words) become
 * who the person decided to be (users/{uid}.identity, functions/src/lib/identity.ts):
 * a sentence written from the words, with the words, joined, as its title, so the
 * byline stays the same. An identity already there is kept. defining_words is
 * removed, and onboarding_complete is set for anyone without it, since having the
 * words used to mean they had finished onboarding.
 *
 * Dry run (default) writes the sentences and prints them; nothing is saved:
 *   npx tsx scripts/migrate-identity.mts --beta
 * Save (writes the sentences again, so they may differ slightly from the dry run):
 *   npx tsx scripts/migrate-identity.mts --beta --apply
 * --live instead of --beta runs on live.
 */
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { generateWithFallback } from '../functions/src/lib/ai/models.js';
import { identityFromWords } from '../functions/src/lib/ai/identity.js';
import type { Identity } from '../functions/src/lib/identity.js';

const target = process.argv.includes('--live') ? 'live' : process.argv.includes('--beta') ? 'beta' : null;
if (!target) { console.error('Pass --beta or --live'); process.exit(1); }
const apply = process.argv.includes('--apply');

dotenv.config({ path: target === 'beta' ? '.env.beta.local' : '.env.local' });
dotenv.config({ path: 'functions/.env' }); // the model key; doesn't override the project's own settings
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) { console.error('Missing FIREBASE_SERVICE_ACCOUNT_KEY'); process.exit(1); }
const serviceAccount = JSON.parse(serviceAccountJson);
const project = target === 'beta' ? 'earnest-page-beta' : 'earnest-page';
if (serviceAccount.project_id !== project) { console.error(`The key is for ${serviceAccount.project_id}, not ${project}`); process.exit(1); }
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const users = await db.collection('users').get();
let migrated = 0;
for (const doc of users.docs) {
    const data = doc.data();
    if (data.defining_words === undefined) continue;
    const words: string[] = (Array.isArray(data.defining_words) ? data.defining_words : [])
        .filter((w: unknown): w is string => typeof w === 'string')
        .map((w: string) => w.trim())
        .filter(Boolean);
    const existing: Identity | undefined = data.identity;
    const identity = existing ?? (words.length > 0
        ? await identityFromWords(words, generateWithFallback).catch((error) => {
            console.error(`  ${doc.id}: the sentence failed (${error instanceof Error ? error.message : error}), using the words`);
            return { text: words.join(', '), title: words.join(', ') };
        })
        : undefined);

    console.log(`${doc.id}: ${words.join(', ') || '(no words)'} → ${identity ? `"${identity.text}" (${identity.title})${existing ? ', kept' : ''}` : '(no identity)'}${data.onboarding_complete ? '' : ', sets onboarding_complete'}`);
    if (apply) {
        await doc.ref.update({
            ...(identity && !existing ? { identity } : {}),
            ...(data.onboarding_complete ? {} : { onboarding_complete: true }),
            defining_words: FieldValue.delete(),
        });
    }
    migrated++;
}
console.log(`${migrated} of ${users.size} users have defining words on ${project}${apply ? ': migrated' : ' (dry run, nothing saved)'}`);
