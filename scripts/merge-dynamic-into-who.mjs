#!/usr/bin/env node

/**
 * merge-dynamic-into-who.mjs
 *
 * One-time Firestore migration: for every user's people[] array,
 * appends any `dynamic` content to the `who` field and deletes `dynamic`.
 *
 * Usage:
 *   node scripts/merge-dynamic-into-who.mjs            # dry-run (no writes)
 *   node scripts/merge-dynamic-into-who.mjs --commit   # actually write to Firestore
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────
const commit = process.argv.includes('--commit');

// Locate service account key
const keyPath = resolve(__dirname, '..', 'functions', 'serviceAccountKey.json');
let serviceAccount;
try {
    serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8'));
} catch {
    console.error(`❌ Could not read service account key at ${keyPath}`);
    console.error('   Place your Firebase service account JSON there or update the path.');
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Migration ───────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n━━━ merge-dynamic-into-who ${commit ? '(COMMIT MODE)' : '(DRY RUN — pass --commit to write)'} ━━━\n`);

    const usersSnap = await db.collection('users').get();
    let usersChecked = 0;
    let usersUpdated = 0;
    let peopleUpdated = 0;

    for (const doc of usersSnap.docs) {
        const data = doc.data();
        const people = data.people;

        if (!Array.isArray(people) || people.length === 0) {
            usersChecked++;
            continue;
        }

        let changed = false;
        const updatedPeople = people.map((p) => {
            if (!p.dynamic || p.dynamic.trim() === '') {
                // No dynamic content — just strip the key if present
                if ('dynamic' in p) {
                    const { dynamic, ...rest } = p;
                    changed = true;
                    return rest;
                }
                return p;
            }

            // Merge dynamic into who
            const existingWho = (p.who || '').trim();
            const dynamicText = p.dynamic.trim();
            const mergedWho = existingWho
                ? `${existingWho}\n${dynamicText}`
                : dynamicText;

            const { dynamic, ...rest } = p;
            changed = true;
            peopleUpdated++;

            return { ...rest, who: mergedWho };
        });

        if (changed) {
            usersUpdated++;
            console.log(`  📝 ${doc.id}: ${updatedPeople.length} people (merging dynamic → who)`);

            if (commit) {
                await doc.ref.update({ people: updatedPeople });
            }
        }

        usersChecked++;
    }

    console.log(`\n✅ Done. Checked ${usersChecked} users, updated ${usersUpdated} users, merged ${peopleUpdated} people entries.`);
    if (!commit) {
        console.log('   ⚠️  This was a DRY RUN. Pass --commit to apply changes.\n');
    }
}

main().catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
