// One-time cleanup: removes active_todos (the old 24-hour directives list) from
// every users/{uid} document. Nothing reads or writes it any more.
//
// Dry run (default) lists what would change; nothing is written:
//   node scripts/cleanup-active-todos.mjs
// Apply:
//   node scripts/cleanup-active-todos.mjs --apply
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const apply = process.argv.includes("--apply");
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) { console.error("Missing FIREBASE_SERVICE_ACCOUNT_KEY"); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
const db = getFirestore();

const users = await db.collection("users").get();
let affected = 0;
let batch = db.batch();
let pending = 0;

for (const doc of users.docs) {
    if (!("active_todos" in doc.data())) continue;
    affected++;
    if (apply) {
        batch.update(doc.ref, { active_todos: FieldValue.delete() });
        if (++pending === 400) {
            await batch.commit();
            batch = db.batch();
            pending = 0;
        }
    }
}
if (apply && pending > 0) await batch.commit();

console.log(`${users.size} users, ${affected} with active_todos${apply ? " — removed" : " (dry run, nothing written)"}`);
