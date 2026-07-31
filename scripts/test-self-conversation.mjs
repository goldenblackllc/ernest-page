/**
 * test-self-conversation.mjs
 *
 * Test script: Fetches the last 20 posts (excluding a given UID),
 * pulls their raw transcripts, and distills each into a conversation
 * the person is having with themselves.
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-self-conversation.mjs
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';

// ─── Config ──────────────────────────────────────────────────────────────────
const EXCLUDE_UID = 'nTsKkFFR2rbfqohxYx1zZN6fJTZ2';
const POST_LIMIT = 20;
const MODEL_ID = 'claude-opus-4-7';

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
const SelfConversationSchema = z.object({
    pseudonym: z.string().describe('Clever 2-3 word pseudonym for the person'),
    messages: z.array(z.object({
        voice: z.enum(['questioning', 'knowing']),
        text: z.string(),
    })).describe('The conversation — alternating between the questioning voice and the knowing voice'),
    editorial_note: z.string().describe('Brief note on what you preserved and what you cut'),
});

// ─── Prompt ──────────────────────────────────────────────────────────────────
const PROMPT = `You are an editor. You're given a raw chat transcript between a person and an AI advisor. The transcript is often messy — stream of consciousness, repetition, circling, tangents.

Your job: **rewrite it as a conversation this person is having with themselves.** Two voices — the part of them that's questioning, uncertain, working through it... and the part of them that already knows the answer. Like an internal dialogue that got externalized.

The questioning voice is the person as they showed up — confused, stuck, wanting something, working it out in real time. Keep their actual words and phrasing where possible.

The knowing voice is the wiser part of themselves. It's not a therapist, not a coach, not an advisor from the outside. It's the version of them that already sees clearly. It speaks the way they would speak to a close friend — direct, warm, no bullshit.

WHAT TO DO:
- Cut the fat: repetition, filler, circling, tangents that go nowhere.
- Clean up stream-of-consciousness into clear, natural sentences — but keep their voice.
- Preserve the key insights and the moments where something shifts.
- Keep the natural flow. Their understanding may change as the conversation progresses — that's the whole point. Don't flatten the journey.
- Use as many or as few messages as the conversation needs. Some are 4 messages. Some are 15. Let the content decide.

SELF-CONTAINMENT:
- A stranger who has NEVER seen the original transcript must be able to follow every message.
- No detail or reference may appear unless it was stated in a prior message within this condensed version.
- The knowing voice cannot reference things that haven't come up yet.
- Every pronoun must have a clear antecedent within the conversation.

PII SCRUBBING:
- Replace names of people they know with relationship roles ("my son", "my partner", "my boss").
- Keep public figures, brands, and cultural references verbatim.

TONE:
- No therapy-speak. No jargon: "boundaries", "trauma", "healing journey", "reframe", "belief system" are BANNED.
- This should read like someone thinking out loud — real, raw, honest.
- Do NOT reference a chat, a session, an app, or a platform. This is a person talking to themselves.`;

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
    console.log('  SELF-CONVERSATION TEST — Distilling transcripts with Opus 4.7');
    console.log(separator());
    console.log(`  Model:         ${MODEL_ID}`);
    console.log(`  Excluding UID: ${EXCLUDE_UID}`);
    console.log(`  Post limit:    ${POST_LIMIT}`);
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

    let totalOriginalWords = 0;
    let totalCondensedWords = 0;
    let publishableCount = 0;
    let totalMessages = 0;

    for (let i = 0; i < eligiblePosts.length; i++) {
        const postDoc = eligiblePosts[i];
        const data = postDoc.data();
        const transcript = data.content_raw;
        const transcriptWordCount = wordCount(transcript);
        totalOriginalWords += transcriptWordCount;

        console.log(separator('─'));
        console.log(`  POST ${i + 1}/${eligiblePosts.length}  |  ID: ${postDoc.id}`);
        console.log(`  Transcript: ${transcriptWordCount} words`);
        console.log(separator('─'));

        console.log('\n  ⏳ Distilling via Opus 4.7...');
        try {
            const result = await generateObject({
                model: anthropic(MODEL_ID),
                schema: SelfConversationSchema,
                prompt: `${PROMPT}\n\nTRANSCRIPT:\n${transcript}`,
            });

            const convo = result.object;
            const convoWords = convo.messages.reduce((sum, m) => sum + wordCount(m.text), 0);
            totalCondensedWords += convoWords;
            totalMessages += convo.messages.length;
            publishableCount++;

            console.log(`\n  ✅ "${convo.pseudonym}" (${convo.messages.length} messages, ${convoWords} words):\n`);

            for (const msg of convo.messages) {
                const label = msg.voice === 'questioning' ? '  ❓' : '  💡';
                console.log(`${label} "${msg.text}"\n`);
            }

            const compression = transcriptWordCount > 0
                ? ((1 - convoWords / transcriptWordCount) * 100).toFixed(1)
                : '0';
            console.log(`  📊 ${transcriptWordCount}w → ${convoWords}w (${compression}% reduction)`);
            console.log(`  📝 ${convo.editorial_note}\n`);

        } catch (err) {
            console.error(`\n  ❌ ERROR: ${err.message}\n`);
        }
    }

    console.log(separator('═'));
    console.log('  SUMMARY');
    console.log(separator('═'));
    console.log(`  Posts processed:     ${eligiblePosts.length}`);
    console.log(`  Publishable:         ${publishableCount}/${eligiblePosts.length}`);
    console.log(`  Total transcript:    ${totalOriginalWords} words`);
    console.log(`  Total condensed:     ${totalCondensedWords} words`);
    if (totalOriginalWords > 0) {
        console.log(`  Reduction:           ${((1 - totalCondensedWords / totalOriginalWords) * 100).toFixed(1)}%`);
    }
    if (publishableCount > 0) {
        console.log(`  Avg messages/post:   ${(totalMessages / publishableCount).toFixed(1)}`);
        console.log(`  Avg words/post:      ${(totalCondensedWords / publishableCount).toFixed(0)}`);
    }
    console.log(separator('═'));
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
