// One-time cleanup: removes billing fields from the free era and the old Stripe
// integration from every users/{uid} document. Session and billing state now
// lives only in users/{uid}.access (functions/src/lib/access/sessionAccess.ts).
//
// Dry run (default) lists what would change; nothing is written:
//   node scripts/cleanup-legacy-billing-fields.mjs
// Apply:
//   node scripts/cleanup-legacy-billing-fields.mjs --apply
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const LEGACY_FIELDS = [
    "session_credits",
    "sessions_today",
    "sessions_today_date",
    "subscription",
    "session_purchases",
    "refund_count",
    "total_sessions_purchased",
    "stripeCustomerId",
    "tts_chars_today",
    "tts_chars_date",
];

const apply = process.argv.includes("--apply");
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) { console.error("Missing FIREBASE_SERVICE_ACCOUNT_KEY"); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
const db = getFirestore();

const users = await db.collection("users").get();
const counts = Object.fromEntries(LEGACY_FIELDS.map((f) => [f, 0]));
let affected = 0;
let batch = db.batch();
let pending = 0;

for (const doc of users.docs) {
    const data = doc.data();
    const present = LEGACY_FIELDS.filter((f) => f in data);
    if (present.length === 0) continue;
    affected++;
    present.forEach((f) => counts[f]++);
    if (apply) {
        batch.update(doc.ref, Object.fromEntries(present.map((f) => [f, FieldValue.delete()])));
        if (++pending === 400) {
            await batch.commit();
            batch = db.batch();
            pending = 0;
        }
    }
}
if (apply && pending > 0) await batch.commit();

console.log(`${users.size} users, ${affected} with legacy fields${apply ? " — removed" : " (dry run, nothing written)"}`);
for (const [field, n] of Object.entries(counts)) if (n) console.log(`  ${field}: ${n}`);
