// One-time migration: My Actions moves from users/{uid}.choices (items with
// `chosen_on`) to users/{uid}.actions (items with `decided_on`). See
// functions/src/lib/actions.ts.
//
//   node scripts/migrate-choices-to-actions.mjs                  # live, dry run
//   node scripts/migrate-choices-to-actions.mjs --apply          # live, write
//   node scripts/migrate-choices-to-actions.mjs --beta --apply   # beta, write
//
// Run it after the new processChat and website are deployed: until then the old
// code keeps writing `choices`. Running it again is safe. An `actions` list the
// new code already wrote is kept, and old items it doesn't have go before it.
// After it has run on live, delete this script and `choices` in firestore.rules.
//
// Needs FIREBASE_SERVICE_ACCOUNT_KEY in .env.local (live) or .env.beta.local (beta).
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
const envFile = process.argv.includes("--beta") ? ".env.beta.local" : ".env.local";
const key = dotenv.parse(readFileSync(envFile)).FIREBASE_SERVICE_ACCOUNT_KEY;
if (!key) { console.error(`Missing FIREBASE_SERVICE_ACCOUNT_KEY in ${envFile}`); process.exit(1); }
const credentials = JSON.parse(key);
initializeApp({ credential: cert(credentials) });
const db = getFirestore();

/** A stored choice as an action; null when it has another shape. */
function toAction(c) {
    if (!c || typeof c.id !== "string" || typeof c.text !== "string" || typeof c.chosen_on !== "string") return null;
    return { id: c.id, text: c.text, decided_on: c.chosen_on, ...(typeof c.done_at === "number" ? { done_at: c.done_at } : {}) };
}

console.log(`${credentials.project_id}${apply ? "" : " (dry run, nothing written)"}`);
const users = await db.collection("users").where("choices", "!=", null).get();
let migrated = 0;
for (const doc of users.docs) {
    // In a transaction, so a tick or a session saved at the same time isn't lost.
    const { done, summary } = await db.runTransaction(async (tx) => {
        const data = (await tx.get(doc.ref)).data();
        if (!Array.isArray(data?.choices)) return { done: false, summary: "left as is: choices is not a list" };
        const old = data.choices.map(toAction);
        if (old.some(a => !a)) return { done: false, summary: "left as is: an item has an unexpected shape" };
        const current = Array.isArray(data.actions) ? data.actions : [];
        const actions = [...old.filter(a => !current.some(c => c.id === a.id)), ...current];
        if (apply) tx.update(doc.ref, { actions, choices: FieldValue.delete() });
        return { done: true, summary: `${old.length} choices + ${current.length} actions -> ${actions.length} actions` };
    });
    if (done) migrated++;
    console.log(`  ${doc.id}: ${summary}`);
}
console.log(`${migrated} of ${users.size} users ${apply ? "migrated" : "to migrate"}`);
