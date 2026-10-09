// Grants (or revokes) a complimentary membership: daily sessions with no Stripe
// subscription and no charge. Billing shows it as "Complimentary" without
// renewal, cancel or refund. See Membership.comp in
// functions/src/lib/access/sessionAccess.ts.
//
//   node scripts/grant-membership.mjs +14065550123          # by phone (E.164)
//   node scripts/grant-membership.mjs <uid>                 # by user id
//   node scripts/grant-membership.mjs +14065550123 --revoke
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const target = process.argv[2];
const revoke = process.argv.includes("--revoke");
if (!target) { console.error("Usage: node scripts/grant-membership.mjs <+phone|uid> [--revoke]"); process.exit(1); }

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) { console.error("Missing FIREBASE_SERVICE_ACCOUNT_KEY"); process.exit(1); }
initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
const db = getFirestore();

const uid = target.startsWith("+") ? (await getAuth().getUserByPhoneNumber(target)).uid : target;
const ref = db.collection("users").doc(uid);
const snap = await ref.get();
if (!snap.exists) { console.error(`No user document for ${uid}`); process.exit(1); }

const current = snap.data().access?.membership;
if (revoke) {
    if (!current?.comp) { console.error("This user has no complimentary membership; nothing changed."); process.exit(1); }
    await ref.update({ "access.membership": FieldValue.delete() });
    console.log(`Revoked the complimentary membership for ${uid}.`);
} else {
    if (current && !current.comp && current.status !== "canceled" && current.current_period_end > Date.now()) {
        console.error("This user has a paid membership. Cancel or refund it in Billing first; nothing changed.");
        process.exit(1);
    }
    const now = Date.now();
    await ref.set({
        access: {
            membership: {
                status: "active",
                subscription_id: "comp",
                comp: true,
                current_period_end: Date.UTC(2100, 0, 1),
                cancel_at_period_end: false,
                started_at: now,
                first_week_sessions: 0,
            },
        },
    }, { merge: true });
    console.log(`Granted a complimentary membership to ${uid}.`);
}
