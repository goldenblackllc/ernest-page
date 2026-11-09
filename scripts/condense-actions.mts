/**
 * One-time tidy of My Actions lists (users/{uid}.actions, functions/src/lib/actions.ts).
 * The session extraction, run with no conversation, merges actions that say the same
 * thing, shortens wordy ones and gives each its kind (every day or once). It never
 * drops an action. Actions ticked under the old rule (done_at) are dropped, as that
 * rule did at the next session.
 *
 * Dry run: prints one person's list before and after, and saves the plan; nothing is written:
 *   npx tsx scripts/condense-actions.mts --beta --uid <uid> --plan <plan.json>
 * Without --uid it plans every list and prints only counts, since the lists are private.
 * Apply a saved plan, to each list as it is then (ticks and deletes since are kept):
 *   npx tsx scripts/condense-actions.mts --beta --apply <plan.json>
 * --live instead of --beta runs on live. Plans hold private actions: delete them after.
 */
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { generateWithFallback } from '../functions/src/lib/ai/models.js';
import { ActionsSchema, buildActionsPrompt, toSessionActions } from '../functions/src/lib/ai/actionsPrompt.js';
import { applySessionActions, currentActions, kindOf, type Action, type SessionActions } from '../functions/src/lib/actions.js';

const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i > 0 ? process.argv[i + 1] : undefined;
};
const target = process.argv.includes('--live') ? 'live' : process.argv.includes('--beta') ? 'beta' : null;
if (!target) { console.error('Pass --beta or --live'); process.exit(1); }
const applyPlan = arg('--apply');
const planPath = arg('--plan');
const onlyUid = arg('--uid');
if (!applyPlan && !planPath) { console.error('Pass --plan <file> for a dry run, or --apply <file>'); process.exit(1); }

dotenv.config({ path: target === 'beta' ? '.env.beta.local' : '.env.local' });
dotenv.config({ path: 'functions/.env' }); // the model key; doesn't override the project's own settings
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!serviceAccountJson) { console.error('Missing FIREBASE_SERVICE_ACCOUNT_KEY'); process.exit(1); }
const serviceAccount = JSON.parse(serviceAccountJson);
const project = target === 'beta' ? 'earnest-page-beta' : 'earnest-page';
if (serviceAccount.project_id !== project) { console.error(`The key is for ${serviceAccount.project_id}, not ${project}`); process.exit(1); }
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

type Plan = { project: string; users: { uid: string; update: SessionActions }[] };
const today = new Date().toISOString().slice(0, 10);

/** The list without the actions ticked under the old rule. */
const withoutOldTicks = (actions: (Action & { done_at?: number })[]): Action[] => actions.filter(a => a.done_at === undefined);
const show = (actions: Action[]) => actions.map(a => `  [${kindOf(a) === 'daily' ? 'every day' : 'once'}] ${a.text}`).join('\n') || '  (empty)';

if (applyPlan) {
    const plan: Plan = JSON.parse(readFileSync(applyPlan, 'utf8'));
    if (plan.project !== project) { console.error(`The plan is for ${plan.project}, not ${project}`); process.exit(1); }
    for (const { uid, update } of plan.users) {
        const ref = db.collection('users').doc(uid);
        const count = await db.runTransaction(async (tx) => {
            const stored = (await tx.get(ref)).data()?.actions || [];
            const { actions } = applySessionActions(withoutOldTicks(stored), update, today, randomUUID);
            tx.update(ref, { actions });
            return [stored.length, actions.length];
        });
        console.log(`${uid}: ${count[0]} → ${count[1]} actions`);
    }
    console.log(`Applied to ${plan.users.length} users on ${project}`);
    process.exit(0);
}

const docs = onlyUid
    ? [await db.collection('users').doc(onlyUid).get()]
    : (await db.collection('users').get()).docs;
const plan: Plan = { project, users: [] };
for (const doc of docs) {
    const stored: Action[] = doc.data()?.actions || [];
    if (stored.length === 0) continue;
    const kept = withoutOldTicks(stored);
    const listed = currentActions(kept, today);

    const { object } = listed.length > 0
        ? await generateWithFallback({ schema: ActionsSchema, prompt: buildActionsPrompt(listed, '', today), abortSignal: AbortSignal.timeout(300_000) })
        : { object: { done: [], changed: [], new_actions: [], rewritten: [] } };
    // With no conversation only the rewrites count
    const update: SessionActions = { done: [], changed: [], new_actions: [], rewritten: toSessionActions(object, listed).rewritten };
    const after = applySessionActions(kept, update, today, () => 'new').actions;
    plan.users.push({ uid: doc.id, update });

    console.log(`${doc.id}: ${stored.length} → ${after.length} actions (${stored.length - kept.length} ticked under the old rule)`);
    if (onlyUid) console.log(`BEFORE\n${show(stored)}\n\nAFTER\n${show(after)}`);
}
writeFileSync(planPath!, JSON.stringify(plan, null, 2));
console.log(`Plan for ${plan.users.length} users on ${project} saved to ${planPath} (dry run, nothing written)`);
