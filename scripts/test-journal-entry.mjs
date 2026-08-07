/**
 * test-journal-entry.mjs
 *
 * Test script: Fetches the last 20 posts, pulls their raw transcripts,
 * and rewrites each as a first-person journal entry using Claude Opus 4.7.
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-journal-entry.mjs
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';

// ─── Config ──────────────────────────────────────────────────────────────────
const EXCLUDE_UID = 'nTsKkFFR2rbfqohxYx1zZN6fJTZ2';
const POST_LIMIT = 20;
const MODEL_ID = 'claude-opus-4-8';

// ─── Firebase Init ───────────────────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (!getApps().length) {
    initializeApp({
        credential: cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
}
const db = getFirestore();

// ─── Anthropic Init via Vercel AI SDK ────────────────────────────────────────
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Zod Schema ──────────────────────────────────────────────────────────────
const JournalEntrySchema = z.object({
    pseudonym: z.string().describe('Clever 2-3 word pseudonym for the person'),
    entry: z.string().describe('The journal entry — first person, one continuous piece of writing'),
});

// ─── Prompt ──────────────────────────────────────────────────────────────────
const PROMPT = `You are an editor. You're given a raw chat transcript between a person and their ideal self.

Rewrite the transcript as a coherent first-person journal entry. One voice. One person thinking on paper.

The ideal self in the transcript represents what the person's ideal version of themselves would think or do. When translating the ideal self's words, write them as the person's own thoughts — what they realized, what they'd tell themselves, what they know deep down.

PII SCRUBBING:
- Replace names of people they know with relationship roles ("my son", "my partner", "my boss").
- Keep public figures, brands, and cultural references verbatim.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function wordCount(text) {
    return text.split(/\s+/).filter(Boolean).length;
}

function separator(char = '═', len = 80) {
    return char.repeat(len);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
    console.log(separator());
    console.log('  JOURNAL ENTRY TEST — Rewriting transcripts with Opus 4.7');
    console.log(separator());
    console.log();

    console.log('Fetching posts from Firestore...');
    const postsSnap = await db.collection('posts')
        .orderBy('created_at', 'desc')
        .limit(200)
        .get();

    const eligiblePosts = postsSnap.docs
        .filter(doc => {
            const data = doc.data();
            const authorId = data.authorId || data.uid;
            return authorId !== EXCLUDE_UID && data.content_raw;
        })
        .slice(0, POST_LIMIT);

    console.log(`Found ${eligiblePosts.length} posts with transcripts.\n`);

    if (eligiblePosts.length === 0) {
        console.log('No posts found. Exiting.');
        return;
    }

    for (let i = 0; i < eligiblePosts.length; i++) {
        const postDoc = eligiblePosts[i];
        const data = postDoc.data();
        const transcript = data.content_raw;
        const transcriptWords = wordCount(transcript);

        console.log(separator('─'));
        console.log(`  POST ${i + 1}/${eligiblePosts.length}  |  ID: ${postDoc.id}  |  ${transcriptWords} words`);
        console.log(separator('─'));

        try {
            const result = await generateObject({
                model: anthropic(MODEL_ID),
                schema: JournalEntrySchema,
                prompt: `${PROMPT}\n\nTRANSCRIPT:\n${transcript}`,
            });

            const journal = result.object;
            const entryWords = wordCount(journal.entry);

            console.log(`\n  "${journal.pseudonym}" (${entryWords} words):\n`);
            console.log(journal.entry);
            console.log();

        } catch (err) {
            console.error(`\n  ❌ ERROR: ${err.message}\n`);
        }
    }

    console.log(separator('═'));
    console.log('  DONE');
    console.log(separator('═'));
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
