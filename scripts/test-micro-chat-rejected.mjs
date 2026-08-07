/**
 * test-micro-chat-rejected.mjs
 *
 * Re-runs ONLY the 2 previously rejected posts with the updated prompt.
 *
 * Usage:
 *   node --env-file=.env.local scripts/test-micro-chat-rejected.mjs
 */

import 'dotenv/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';

// ─── Config ──────────────────────────────────────────────────────────────────
const REJECTED_POST_IDS = ['GEIGKiU575XTz4GtEeTy', 'VTL7BffaQegNrZ9F7ftr'];
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

// ─── Anthropic Init ──────────────────────────────────────────────────────────
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Zod Schema ──────────────────────────────────────────────────────────────
const MicroChatSchema = z.object({
    is_publishable: z.boolean().describe('false ONLY if the transcript is a system test, contains only greetings with no real question, or is a single message with no conversation. Light or practical questions ARE publishable.'),
    pseudonym: z.string().describe('Clever 2-3 word sign-off for the user'),
    hook: z.string().describe('The first user message'),
    messages: z.array(z.object({
        role: z.enum(['user', 'ideal_self']),
        text: z.string(),
    })).describe('The full micro chat'),
    editorial_note: z.string().describe('Brief note on what you preserved and what you cut'),
});

// ─── Use same prompt from main script ────────────────────────────────────────
const MICRO_CHAT_PROMPT = `You are an editor at a social media platform. Your job is to take a raw, long-form chat transcript between a user and their Ideal Self, and distill it into a **Micro Chat** — a concise, punchy version of the same conversation that captures the full arc in fewer, tighter messages.

WHAT A MICRO CHAT IS:
A Micro Chat reads like a screenshot of a real text conversation that went viral. It's the version of the conversation you'd send to a friend. Every message earns its place. The emotional arc is preserved — the reader should feel the same journey the user felt, just faster.

YOUR TASK:
Read the transcript and distill it into a Micro Chat. Conversations range from deep emotional explorations to light practical questions — BOTH are valid and publishable.

For DEEPER conversations, look for:
1. THE HOOK — the user's opening tension.
2. THE TURN — the moment the Ideal Self cracks it open.
3. THE REVEAL — the user's moment of clarity.
4. THE LANDING — the final directive or insight.

For LIGHTER conversations (etiquette, practical advice, recommendations), simply distill the question and the advice into a clean, helpful exchange. Not every conversation needs a dramatic emotional arc — sometimes a person just wants to know how to help a sick neighbor, and that's a great post.

Then write the Micro Chat.

═══════════════════════════════════════════════════════════════════════
RULE #1 — SELF-CONTAINMENT (THIS IS THE MOST IMPORTANT RULE)
═══════════════════════════════════════════════════════════════════════

The Micro Chat must be 100% self-contained. A stranger who has NEVER read the transcript must be able to follow every single message.

This means:
- NO detail, fact, or reference may appear in any message unless it was EXPLICITLY stated in a PRIOR message within the Micro Chat itself.
- The Ideal Self CANNOT reference details from the transcript that haven't been mentioned yet in the Micro Chat. It only knows what the user has said SO FAR in the Micro Chat.
- The user CANNOT answer a question that was never asked. If a user's answer requires a specific question to make sense, that question must appear in the previous Ideal Self message.
- Every pronoun must have a clear antecedent WITHIN the Micro Chat. No orphan "it", "that", or "him" without prior establishment.

SELF-CONTAINMENT AUDIT: Before outputting, re-read your Micro Chat from top to bottom as if you have NEVER seen the transcript. For EVERY message, ask: "Does this make sense given ONLY what was said above?" If any message references something not yet established, fix it by either:
  (a) Having an earlier message introduce that detail, or
  (b) Removing the reference entirely.

═══════════════════════════════════════════════════════════════════════
OTHER RULES
═══════════════════════════════════════════════════════════════════════

- Preserve the conversational structure: alternating user and ideal_self messages.
- Each message should be 1-3 sentences. Tight. Conversational. Like texting.
- The FIRST user message is the hook — raw, vulnerable, and attention-grabbing. It should contain enough context to orient the reader.
- Don't add messages that weren't in the spirit of the original conversation. You're distilling, not inventing.
- The Ideal Self should sound like a direct, wise friend — not a therapist. No jargon: "boundaries", "trauma", "healing journey", "reframe", "belief system" are all BANNED.
- Keep the user's actual words and phrasing where possible. The authenticity is what makes it shareable.
- The last Ideal Self message should land with impact — one concrete thing to do, or one truth that changes everything.
- PII SCRUBBING: Replace names of people the user personally knows with relationship roles ("my son", "my partner", "my boss"). Keep public figures, brands, and cultural references verbatim.
- Do NOT reference the chat, the session, or the platform. This should read as a standalone conversation.`;

function wordCount(text) {
    return text.split(/\s+/).filter(Boolean).length;
}

async function main() {
    console.log('Re-running 2 previously rejected posts with updated prompt...\n');

    for (const postId of REJECTED_POST_IDS) {
        const doc = await db.collection('posts').doc(postId).get();
        if (!doc.exists) { console.log(`Post ${postId} not found.`); continue; }

        const data = doc.data();
        const transcript = data.content_raw;
        const existingLetter = data.public_post?.letter || data.letter || '';
        const existingResponse = data.public_post?.response || data.response || '';
        const existingPseudonym = data.public_post?.pseudonym || data.pseudonym || 'Anonymous';

        console.log('═'.repeat(70));
        console.log(`  POST: ${postId}`);
        console.log(`  Transcript: ${wordCount(transcript)} words`);
        console.log('═'.repeat(70));

        if (existingLetter) {
            console.log(`\n  📜 CURRENT (Dear Earnest) — ${existingPseudonym}:`);
            console.log(`  Letter (${wordCount(existingLetter)}w): ${existingLetter.slice(0, 200)}...`);
            if (existingResponse) {
                console.log(`  Response (${wordCount(existingResponse)}w): ${existingResponse.slice(0, 200)}...`);
            }
        }

        console.log('\n  ⏳ Distilling via Opus 4.7...');
        try {
            const result = await generateObject({
                model: anthropic(MODEL_ID),
                schema: MicroChatSchema,
                prompt: `${MICRO_CHAT_PROMPT}\n\nTRANSCRIPT:\n${transcript}`,
            });

            const mc = result.object;
            const mcWords = mc.messages.reduce((sum, m) => sum + wordCount(m.text), 0);

            console.log(`\n  ${mc.is_publishable ? '✅ PUBLISHABLE' : '❌ NOT PUBLISHABLE'}`);
            console.log(`  Pseudonym: ${mc.pseudonym}`);
            console.log(`  Hook: "${mc.hook}"`);
            console.log(`  Messages: ${mc.messages.length} | Words: ${mcWords}\n`);

            for (const msg of mc.messages) {
                const label = msg.role === 'user' ? '  💬 YOU' : '  🪞 IDEAL SELF';
                console.log(`${label} (${wordCount(msg.text)}w):`);
                console.log(`    "${msg.text}"\n`);
            }

            console.log(`  📝 Editorial: ${mc.editorial_note}\n`);
        } catch (err) {
            console.error(`  ❌ ERROR: ${err.message}\n`);
        }
    }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
