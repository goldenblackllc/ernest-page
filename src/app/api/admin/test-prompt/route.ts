import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { generateWithFallback, OPUS_MODEL } from '@/lib/ai/models';
import { z } from 'zod';
import { getPostText } from '@/lib/getPostText';

const SYSTEM_PROMPT = `You are a copywriter for a personal advice brand called "Earnest Page." You convert advice column posts into 15-20 second short-form video scripts.

INPUT: A "letter" (someone's problem) and a "response" (the advice given).

OUTPUT: A JSON object with "question" and "answer" fields. Raw spoken words only — no labels, no formatting.

QUESTION (spoken by the person asking):
- The FIRST 7 WORDS are the hook. A stranger scrolling must stop in 1 second.
- Lead with the universal pain, not the specific situation. "I hate my body" beats "I'm on a diet and it's hard."
- 1-2 sentences max. 12-25 words. Conversational, raw, slightly vulnerable.
- Strip away backstory. No setup, no context-building. Just the gut-punch.

ANSWER (spoken by Earnest):
- One insight the person wasn't seeing — said like a direct friend, not a therapist.
- End with ONE concrete thing to do TODAY. Make it feel like a moment, not an errand.
- 2-3 sentences. 25-40 words.

RULES:
- TOTAL script: 40-60 words. Shorter is better. Every word must earn its place.
- NO "Dear Earnest." NO names. Say "your partner," "your boss," "your friend."
- The question must work even if the viewer knows NOTHING about the person.
- No self-help jargon: "reframe," "belief," "boundaries," "toxic," "healing journey."
- The answer needs ONE quotable line — something people would screenshot.`;

export async function GET(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();
        if (uid !== process.env.ADMIN_UID) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const snap = await db.collection('posts')
            .orderBy('created_at', 'desc')
            .limit(100)
            .get();

        const OWNER_UID = 'nTsKkFFR2rbfqohxYx1zZN6fJTZ2';

        const posts = snap.docs.map(doc => {
            const d = doc.data();
            const { letter, response } = getPostText(d);
            return {
                id: doc.id,
                uid: d.uid,
                pseudonym: d.public_post?.pseudonym || d.pseudonym || 'Anonymous',
                letter,
                response,
            };
        }).filter(p => p.letter && p.response && p.letter.length > 30 && p.uid !== OWNER_UID);

        const results = [];

        for (const post of posts) {
            try {
                console.log(`[PromptTest] Processing ${post.pseudonym}...`);
                const result = await generateWithFallback({
                    primaryModelId: OPUS_MODEL,
                    schema: z.object({
                        question: z.string(),
                        answer: z.string(),
                    }),
                    prompt: `${SYSTEM_PROMPT}\n\nLETTER:\n${post.letter}\n\nRESPONSE:\n${post.response}`,
                });

                const { question, answer } = result.object as { question: string; answer: string };
                const qWords = question.split(/\s+/).length;
                const aWords = answer.split(/\s+/).length;

                results.push({
                    pseudonym: post.pseudonym,
                    question,
                    answer,
                    qWords,
                    aWords,
                    total: qWords + aWords,
                });
                console.log(`[PromptTest] ${post.pseudonym}: Q=${qWords}w A=${aWords}w`);
            } catch (err: any) {
                console.error(`[PromptTest] ${post.pseudonym} FAILED:`, err.message);
                results.push({ pseudonym: post.pseudonym, question: 'FAILED', answer: err.message, qWords: 0, aWords: 0, total: 0 });
            }
        }

        return NextResponse.json({ count: results.length, results });
    } catch (error: any) {
        console.error('[PromptTest] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
