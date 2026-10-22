// Copies one user's live data into the beta project (earnest-page-beta), so
// changes can be tested on real data. One way only: nothing in beta ever
// reaches live. Each run replaces the user's beta record with a fresh snapshot.
//
//   node scripts/copy-to-beta.mjs +14065550123             # by phone (E.164)
//   node scripts/copy-to-beta.mjs +14065550123 --posts 50  # more posts (default 20)
//
// Copies the user document (Bible, situations, dossier, recaps, people, wants,
// voice, avatar) and their most recent posts. Not copied: billing (`access`,
// credit_lots, paid_sessions) and open chats. The beta account gets a
// complimentary membership instead, so test sessions cost nothing. The avatar
// files (main, reference and situation avatars) are copied to beta Storage,
// because beta's image functions draw the character from them. Post images and
// audio stay in live Storage; beta reads them by URL.
//
// Needs FIREBASE_SERVICE_ACCOUNT_KEY in .env.local (live) and in
// .env.beta.local (beta).
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const BETA_PROJECT = "earnest-page-beta";
// Fields that are billing, test settings, or would queue a Bible recompile in beta.
const SKIPPED_FIELDS = ["access", "tester", "prompt_channel", "bible_dirty_since", "bible_compile_queued_at"];

const phone = process.argv[2];
const postsArg = process.argv.indexOf("--posts");
const postLimit = postsArg > 0 ? Number(process.argv[postsArg + 1]) : 20;
if (!phone?.startsWith("+") || !Number.isInteger(postLimit) || postLimit < 0) {
    console.error("Usage: node scripts/copy-to-beta.mjs <+phone> [--posts N]");
    process.exit(1);
}

function serviceAccount(envFile) {
    const key = dotenv.parse(readFileSync(envFile)).FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!key) { console.error(`Missing FIREBASE_SERVICE_ACCOUNT_KEY in ${envFile}`); process.exit(1); }
    return JSON.parse(key);
}

const liveKey = serviceAccount(".env.local");
const betaKey = serviceAccount(".env.beta.local");
if (betaKey.project_id !== BETA_PROJECT || liveKey.project_id === BETA_PROJECT) {
    console.error(`Expected the live key in .env.local and the ${BETA_PROJECT} key in .env.beta.local`);
    process.exit(1);
}
const live = initializeApp({ credential: cert(liveKey) }, "live");
const beta = initializeApp({ credential: cert(betaKey) }, "beta");
const liveDb = getFirestore(live);
const betaDb = getFirestore(beta);

// The beta account has the same uid as live, so copied posts and recaps still line up.
const uid = (await getAuth(live).getUserByPhoneNumber(phone)).uid;
const userSnap = await liveDb.collection("users").doc(uid).get();
if (!userSnap.exists) { console.error(`No live user document for ${uid}`); process.exit(1); }

const betaAuth = getAuth(beta);
try {
    const existing = await betaAuth.getUser(uid);
    if (existing.phoneNumber !== phone) await betaAuth.updateUser(uid, { phoneNumber: phone });
} catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    await betaAuth.createUser({ uid, phoneNumber: phone });
}

// Fresh snapshot: clear the beta user's record and posts first.
const betaUserRef = betaDb.collection("users").doc(uid);
await betaDb.recursiveDelete(betaUserRef);
const oldPosts = await betaDb.collection("posts").where("authorId", "==", uid).get();
await Promise.all(oldPosts.docs.map((d) => d.ref.delete()));

const user = userSnap.data();
for (const field of SKIPPED_FIELDS) delete user[field];
// A build in progress on live never finishes in beta; keep the last finished Bible.
if (user.bible?.status === "compiling") user.bible.status = "stable";
user.access = {
    membership: {
        status: "active",
        subscription_id: "comp",
        comp: true,
        current_period_end: Date.UTC(2100, 0, 1),
        cancel_at_period_end: false,
        started_at: Date.now(),
        first_week_sessions: 0,
    },
};
await betaUserRef.set(user);

// authorId: every post has it, and live has the authorId + created_at index.
const posts = postLimit === 0 ? [] : (await liveDb.collection("posts")
    .where("authorId", "==", uid)
    .orderBy("created_at", "desc")
    .limit(postLimit)
    .get()).docs;
await Promise.all(posts.map((d) => betaDb.collection("posts").doc(d.id).set(d.data())));

// Avatars: avatars/{uid}.jpg, avatars/{uid}_reference.jpg and avatars/{uid}/{situation}.jpg.
const isAvatar = (name) => name === `avatars/${uid}.jpg` || name === `avatars/${uid}_reference.jpg` || name.startsWith(`avatars/${uid}/`);
const liveBucket = getStorage(live).bucket(`${liveKey.project_id}.firebasestorage.app`);
const betaBucket = getStorage(beta).bucket(`${BETA_PROJECT}.firebasestorage.app`);
const [oldAvatars] = await betaBucket.getFiles({ prefix: `avatars/${uid}` });
await Promise.all(oldAvatars.filter((f) => isAvatar(f.name)).map((f) => f.delete()));
const [avatars] = await liveBucket.getFiles({ prefix: `avatars/${uid}` });
const copied = avatars.filter((f) => isAvatar(f.name));
await Promise.all(copied.map(async (f) => {
    const [data] = await f.download();
    await betaBucket.file(f.name).save(data, {
        contentType: f.metadata.contentType,
        metadata: { metadata: f.metadata.metadata },
    });
}));

console.log(`Copied ${uid} to ${BETA_PROJECT}: user record, ${posts.length} posts, ${copied.length} avatar files, complimentary membership.`);
