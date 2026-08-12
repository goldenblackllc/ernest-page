import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { config } from 'dotenv';

config({ path: '.env.local' });

if (!getApps().length) {
    initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
    });
}
const db = getFirestore();

const ADMIN_UID = 'nTsKkFFR2rbfqohxYx1zZN6fJTZ2';

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const QuoteSchema = z.object({
    quote: z.string().describe('3-6 word insight or realization from the conversation that would make a stranger curious'),
    topic: z.enum([
        'relationships', 'dating', 'family', 'career', 'money',
        'health', 'fashion', 'identity', 'discipline', 'faith'
    ]).describe('Dominant theme of the conversation'),
});

const PROMPT = `You are given a condensed conversation between a person and their Ideal Self (advisor).

Your job: extract ONE short phrase (3-6 words) that captures the INSIGHT or REALIZATION from this conversation — the interesting thing someone learned or discovered.

This is NOT about drama. NOT about the problem. It's about the "oh!" moment — the thing that makes a stranger say "That's interesting, I want to learn about that."

Think: the wisdom, the shift, the surprising truth, the reframe. The thing you'd tell a friend at dinner because it changed how you see something.

Rules:
- 3-6 words
- Must capture an INSIGHT, not a problem. Not the pain — the discovery.
- Universally interesting — a stranger with NO context reads it and thinks "huh, tell me more"
- From the actual conversation — what was realized, learned, or shifted
- Positive or thought-provoking, never dramatic or sad

BAD examples (highlighting problems/drama — DO NOT DO THIS):
- "I am disposable" — that's pain, not insight
- "I fear failing as father" — that's a problem, not a realization
- "I've always felt weak" — drama, not wisdom
- "I don't know my daughter" — sad, not interesting
- "I don't want her to hate me" — pain

GOOD examples (insights that make you curious):
- "Ice cream is the parenting" — surprising reframe, makes you want to know why
- "Your salary isn't your worth" — thought-provoking truth
- "Showing up is the workout" — reframe that clicks
- "The trust protects love" — unexpected connection
- "Rest isn't a reward" — challenges a common belief
- "Style is a decision" — makes you think differently
- "Success needs a definition" — simple but profound
- "The list is the avoidance" — surprising insight

Also assign exactly ONE topic from the enum based on the dominant theme.`;

async function run() {
    console.log('Fetching non-admin posts...\n');
    
    const snap = await db.collection('posts')
        .orderBy('created_at', 'desc')
        .limit(200)
        .get();

    const posts = [];
    for (const doc of snap.docs) {
        const data = doc.data();
        if (data.uid === ADMIN_UID) continue;
        
        const transcript = data.public_post?.condensed_transcript;
        const contentRaw = data.content_raw;
        
        if (transcript && transcript.length > 0) {
            const formatted = transcript.map(m => 
                `${m.role === 'user' ? 'Person' : 'Advisor'}: ${m.text}`
            ).join('\n');
            posts.push({ id: doc.id, title: data.title, conversation: formatted });
        } else if (contentRaw) {
            posts.push({ id: doc.id, title: data.title, conversation: contentRaw });
        }
        
        if (posts.length >= 20) break;
    }

    console.log(`Found ${posts.length} non-admin posts\n`);
    console.log('='.repeat(90));
    console.log('v2 PROMPT — INSIGHT/REALIZATION — on non-admin posts');
    console.log('='.repeat(90));

    let count = 0;
    for (const post of posts) {
        count++;
        try {
            const result = await generateObject({
                model: anthropic('claude-sonnet-5'),
                schema: QuoteSchema,
                prompt: `${PROMPT}\n\nCONVERSATION:\n${post.conversation.substring(0, 6000)}`,
            });

            const { quote, topic } = result.object;
            console.log(`\n${count}. "${quote}"  [${topic}]`);
            console.log(`   Title: ${post.title || '(no title)'}`);
            console.log('-'.repeat(90));
        } catch (err) {
            const body = err.responseBody ? JSON.parse(err.responseBody) : {};
            console.error(`\n${count}. POST ${post.id} — ERROR: ${body?.error?.message || err.message}`);
            console.log('-'.repeat(90));
        }
    }

    console.log(`\n${'='.repeat(90)}`);
    console.log(`Done. ${count} posts.`);
}

run().catch(console.error);
