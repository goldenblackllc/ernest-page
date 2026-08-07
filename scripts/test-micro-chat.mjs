/**
 * test-micro-chat.mjs
 *
 * Test script: Fetches the last 20 posts (excluding a given UID),
 * pulls their raw transcripts, and distills each into a "Micro Chat"
 * using Claude Opus 4.7 via the Vercel AI SDK.
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-micro-chat.mjs
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
const MicroChatSchema = z.object({
    pseudonym: z.string().describe('Clever 2-3 word pseudonym for the user, e.g. "Curious Creator"'),
    messages: z.array(z.object({
        role: z.enum(['user', 'ideal_self']),
        text: z.string(),
    })).describe('The condensed conversation — alternating user and ideal_self messages'),
    editorial_note: z.string().describe('Brief note on what you preserved and what you cut'),
});

// ─── Prompt ──────────────────────────────────────────────────────────────────
const MICRO_CHAT_PROMPT = `You are an editor. You're given a raw chat transcript between a person and their Ideal Self (an AI advisor). The transcript is often messy — stream of consciousness, repetition, circling, tangents.

Your job: **rewrite the conversation so it's clean, condensed, and readable to a stranger.** Preserve the back-and-forth structure. Keep it as a conversation. Just make it a GOOD conversation — one that flows, makes sense, and captures the journey the person went through.

WHAT TO DO:
- Cut the fat: repetition, filler, circling, tangents that go nowhere.
- Clean up the user's stream-of-consciousness into clear, natural sentences — but keep their voice and their real words where possible.
- Preserve the Ideal Self's key insights and the moments where something shifts for the user.
- Keep the natural flow of the conversation. The person's want or understanding may change as the conversation progresses — that's the whole point. Don't flatten the journey into a single question and answer.
- Use as many or as few messages as the conversation needs. Some are 4 messages. Some are 15. Let the content decide.

SELF-CONTAINMENT:
- A stranger who has NEVER seen the original transcript must be able to follow every message.
- No detail or reference may appear unless it was stated in a prior message within this condensed version.
- The Ideal Self cannot reference things from the transcript that haven't come up yet in the condensed version.
- Every pronoun must have a clear antecedent within the conversation.

PII SCRUBBING:
- Replace names of people the user personally knows with relationship roles ("my son", "my partner", "my boss").
- Keep public figures, brands, and cultural references verbatim.

TONE:
- The Ideal Self should sound like a direct, wise friend — not a therapist. No jargon: "boundaries", "trauma", "healing journey", "reframe", "belief system" are BANNED.
- Keep the user's actual words and phrasing where possible. The authenticity matters.
- Do NOT reference the chat, the session, or the platform.`;

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
    console.log('  MICRO CHAT TEST — Distilling transcripts with Opus 4.7');
    console.log(separator());
    console.log(`  Model:         ${MODEL_ID}`);
    console.log(`  Excluding UID: ${EXCLUDE_UID}`);
    console.log(`  Post limit:    ${POST_LIMIT}`);
    console.log(separator());
    console.log();

    // Fetch recent posts with transcripts, excluding the specified UID
    console.log('Fetching posts from Firestore...');
    const postsSnap = await db.collection('posts')
        .orderBy('created_at', 'desc')
        .limit(200) // over-fetch to account for filtering
        .get();

    const eligiblePosts = postsSnap.docs
        .filter(doc => {
            const data = doc.data();
            const authorId = data.authorId || data.uid;
            return authorId !== EXCLUDE_UID && data.content_raw;
        })
        .slice(0, POST_LIMIT);

    console.log(`Found ${eligiblePosts.length} posts with transcripts (after excluding UID).\n`);

    if (eligiblePosts.length === 0) {
        console.log('No posts found. Exiting.');
        return;
    }

    let totalOriginalWords = 0;
    let totalMicroWords = 0;
    let publishableCount = 0;
    let totalMessages = 0;
    let totalCurrentPostWords = 0;

    for (let i = 0; i < eligiblePosts.length; i++) {
        const postDoc = eligiblePosts[i];
        const data = postDoc.data();
        const transcript = data.content_raw;
        const existingLetter = data.public_post?.letter || data.letter || '';
        const existingResponse = data.public_post?.response || data.response || '';
        const existingPseudonym = data.public_post?.pseudonym || data.pseudonym || 'Anonymous';

        const transcriptWordCount = wordCount(transcript);
        const existingPostWords = wordCount(existingLetter) + wordCount(existingResponse);
        totalOriginalWords += transcriptWordCount;
        totalCurrentPostWords += existingPostWords;

        console.log(separator('─'));
        console.log(`  POST ${i + 1}/${eligiblePosts.length}  |  ID: ${postDoc.id}`);
        console.log(`  Transcript: ${transcriptWordCount} words  |  Current post: ${existingPostWords} words`);
        console.log(separator('─'));

        // Show existing Dear Earnest format for comparison
        if (existingLetter) {
            console.log('\n  📜 CURRENT FORMAT (Dear Earnest):');
            console.log(`  Pseudonym: ${existingPseudonym}`);
            console.log(`  Letter (${wordCount(existingLetter)}w):`);
            // Indent and clean up the letter for display
            const letterDisplay = existingLetter.replace(/\\n/g, '\n').replace(/\n/g, '\n    ');
            console.log(`    ${letterDisplay}`);
            if (existingResponse) {
                console.log(`  Response (${wordCount(existingResponse)}w):`);
                const responseDisplay = existingResponse.replace(/\\n/g, '\n').replace(/\n/g, '\n    ');
                console.log(`    ${responseDisplay}`);
            }
        }

        // Call Claude Opus 4.7 via Vercel AI SDK
        console.log('\n  ⏳ Distilling via Opus 4.7...');
        try {
            const result = await generateObject({
                model: anthropic(MODEL_ID),
                schema: MicroChatSchema,
                prompt: `${MICRO_CHAT_PROMPT}\n\nTRANSCRIPT:\n${transcript}`,
            });

            const microChat = result.object;

            const microChatWords = microChat.messages.reduce((sum, m) => sum + wordCount(m.text), 0);
            totalMicroWords += microChatWords;
            totalMessages += microChat.messages.length;
            publishableCount++;

            console.log(`\n  ✅ CONDENSED (${microChat.messages.length} messages, ${microChatWords} words):`);
            console.log(`  Pseudonym: ${microChat.pseudonym}`);
            console.log();

            for (const msg of microChat.messages) {
                const label = msg.role === 'user' ? '  💬 YOU' : '  🪞 IDEAL SELF';
                const words = wordCount(msg.text);
                console.log(`${label} (${words}w):`);
                console.log(`    "${msg.text}"`);
                console.log();
            }

            // Compression stats
            const compressionRatio = transcriptWordCount > 0
                ? ((1 - microChatWords / transcriptWordCount) * 100).toFixed(1)
                : '0';
            console.log(`  📊 Compression: ${transcriptWordCount}w transcript → ${microChatWords}w condensed (${compressionRatio}% reduction)`);
            if (existingPostWords > 0) {
                const diff = microChatWords - existingPostWords;
                const vsCurrent = diff > 0 ? '+' : '';
                console.log(`  📊 vs Current Dear Earnest: ${existingPostWords}w → ${microChatWords}w (${vsCurrent}${diff}w)`);
            }
            console.log(`  📝 Editorial: ${microChat.editorial_note}`);
            console.log();

        } catch (err) {
            console.error(`\n  ❌ ERROR: ${err.message}`);
            console.log();
        }
    }

    // ─── Summary ─────────────────────────────────────────────────────────────
    console.log(separator('═'));
    console.log('  SUMMARY');
    console.log(separator('═'));
    console.log(`  Posts processed:        ${eligiblePosts.length}`);
    console.log(`  Publishable:            ${publishableCount}/${eligiblePosts.length}`);
    console.log(`  Total transcript words: ${totalOriginalWords}`);
    console.log(`  Total Dear Earnest:     ${totalCurrentPostWords} words (current format)`);
    console.log(`  Total Micro Chat:       ${totalMicroWords} words`);
    if (totalOriginalWords > 0) {
        console.log(`  Transcript → Micro:     ${((1 - totalMicroWords / totalOriginalWords) * 100).toFixed(1)}% reduction`);
    }
    if (totalCurrentPostWords > 0) {
        const diff = totalMicroWords - totalCurrentPostWords;
        const sign = diff > 0 ? '+' : '';
        console.log(`  Dear Earnest → Micro:   ${sign}${diff} words (${sign}${((diff / totalCurrentPostWords) * 100).toFixed(1)}%)`);
    }
    if (publishableCount > 0) {
        console.log(`  Avg messages/post:      ${(totalMessages / publishableCount).toFixed(1)}`);
        console.log(`  Avg words/post:         ${(totalMicroWords / publishableCount).toFixed(0)}`);
    }
    console.log(separator('═'));
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
