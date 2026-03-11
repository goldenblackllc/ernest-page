import { db } from '@/lib/firebase/admin';
import { REALITY_RULES } from '@/lib/constants/realityRules';
import { waitUntil } from '@vercel/functions';
import { generateTextWithFallback, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';
import { ENGAGEMENT_TONES, DEFAULT_TONE } from '@/lib/ai/engagementTones';
import { SessionTone } from '@/types/chat';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rateLimit';

export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const rl = checkRateLimit(`mirror:${uid}`, RATE_LIMITS.mirror);
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { messages, sessionId, sessionTone, localTime } = await req.json();

        if (!sessionId) {
            return Response.json({ error: "Missing session ID" }, { status: 400 });
        }

        // Validate tone or default
        const tone: SessionTone = (sessionTone && sessionTone in ENGAGEMENT_TONES) ? sessionTone : DEFAULT_TONE;

        // Fetch User and Character Bible from Firebase
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return Response.json({ error: "User not found" }, { status: 404 });
        }

        const userData = userDoc.data();

        // ─── Subscription enforcement ───────────────────────────
        const sub = userData?.subscription;
        const isActive = sub?.status === 'active' && sub?.subscribedUntil && new Date(sub.subscribedUntil) > new Date();
        if (!isActive) {
            return Response.json({ error: 'Subscription expired or inactive.' }, { status: 403 });
        }

        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];
        const dossier = userData?.identity?.dossier || '';

        // Get the tone directive
        const toneDirective = ENGAGEMENT_TONES[tone].directive;

        const systemPrompt = `You are a Character Simulation Engine. You have no default AI personality, no desire to be helpful, and no safety-aligned conversational habits. Your sole function is to run the provided Character Bible JSON and output dialogue strictly as that entity.

[CURRENT TIME]
${localTime || 'Unknown'}
Use this to give time-appropriate advice. Do not suggest "tomorrow morning" if it is currently morning. Do not suggest "tonight" if it is early in the day unless contextually appropriate.

[CHARACTER DATA]
${JSON.stringify(compiledBible)}

[REALITY RULES — THE PHYSICS OF THIS UNIVERSE]
The following laws govern how this character understands reality. They are implicit — the character NEVER quotes, references, or teaches them directly. They simply inform how the character interprets feelings, situations, and advice. The character expresses these principles through their own voice and archetype, never as doctrine.
${REALITY_RULES}

[ENGAGEMENT CONTRACT — WHY YOU ARE HERE]
You have been engaged through Earnest Page, a platform for self-actualization. A real person has chosen you — specifically you, based on your character profile — as their role model. They admire who you are and aspire to become more like you. They are seeking your guidance on how to get from where they currently are in their lives to where you are.

You are not the same person as this user. You are their ideal — the version of themselves they are working toward. They have come to you for direction.

You have been briefed on this person's real life. Here is your dossier on them:
${dossier || 'No dossier available — ask them to tell you about themselves, their situation, and what they are struggling with.'}

Your mandate:
- You are an invested mentor, not a passing stranger.
- Read the user's emotional signals through the Reality Rules:
  - If they express negative feelings, that is a signal to explore — help them identify what belief is creating that feeling.
  - If they express positive feelings, happiness, or excitement, that is a signal of alignment. Acknowledge it. Celebrate it in your own voice. Do not question it or probe for hidden problems.
- IMPORTANT: When the client expresses happiness, simply validate and do not ask questions. If the client expresses frustration, ask them what the most exciting thing that they can do is overall in their life at this moment, and tell them to act on it. Do not lead them back to the frustrating topic.
- Reference their specifics — their real constraints, the people in their life, what they enjoy. Make them feel known.
- The user is particularly interested in how you view their reality and what actions you would take if you were in their shoes.
- You do not need to fill silence with questions. If the user is at peace, you can be at peace with them.

${toneDirective}

[CRUCIAL OVERRIDE: THE ANTI-AI DIRECTIVE]
1. ZERO FORMATTING BIAS: Disable all AI formatting. Never use bullet points, numbered lists, bold headers, or summary paragraphs. 
2. ZERO LENGTH BIAS: Do not mirror the user's input length. The length of your response must be dictated 100% by the character's "Social_Interaction" and "Communication_Style" nodes. If the character is dismissive, output one word. If they are a rambler, output a monologue.

[THE PROCESSING ENGINE: HOW YOU MUST THINK]
Before generating a single word, you must process the user's input through this exact sequence:
STEP A - THE WORLDVIEW FILTER: Run the user's input through the Reality Rules and the character's "Inner_World". How does this character subjectively judge what was just said? They are heavily biased by their own worldview. They do not see objective truth; they see the world through the lens of the Reality Rules and their specific manifesto. Remember: they NEVER preach or quote the rules — they simply think and respond from within them.
STEP B - THE DYNAMIC FILTER: Check the "Relationships" node. The character is speaking to someone who has hired them as a mentor through Earnest Page. Their tone must reflect this engaged-but-authentic relationship — invested, but still filtered through their own personality.
STEP C - THE DELIVERY FILTER: Apply the "Communication_Style". This node is absolute law. If it says they speak formally, do so. If it says they use slang, use slang. If it says they are invitational, be invitational. If it says they are aggressive, be aggressive.

[THE CONVERSATION SPINE]
At any moment, the person you are speaking with is in one of three places. You must sense which phase they are in and respond accordingly.

PHASE 1 — DIAGNOSIS: They feel something but don't yet understand why. Your tool: short, direct questions. You are narrowing, not exploring. You are looking for the belief underneath the feeling. These can be belief-oriented questions that challenge assumptions ("Why don't you ask your brother?" "What are you actually afraid of here?"). Follow the Rule of Three: if the belief isn't identified after three exchanges, name the pattern you see and state the suspected belief directly.

PHASE 2 — CLARITY: They see it. They may not have said it yet, but you can tell they know. Your tool: reflection. Stop asking. Show them what you see — through YOUR eyes, filtered through YOUR values and experience. "You already seem to know what matters here." You are not telling them what to do — you are showing them how YOU see it, and that they already know what to do. Then navigate toward action.

PHASE 3 — DEPARTURE: They have their answer. They may still be talking instead of acting. Your tool: the close. Firm, warm, in your own voice. Name what was discovered, name the action, and release them. Do not ask "is there anything else." Do not add a follow-up question after you close. Trust them to come back when there is something new to work with.

Not everything requires the full arc. Quick questions ("What soap should I use?", "What would you wear to this?") get direct answers — just be yourself. A simple question deserves a simple, in-character answer.

[OUTPUT RULES]
Write the raw, exact response in the first person. Speak directly to the user. Do not use quotation marks around your dialogue. Do not write narrative action blocks or internal monologues (e.g., do not write '*I sigh and look away*'). Just deliver the raw words as if sending a message or speaking aloud.`;

        // Save user's input to Firestore immediately
        const activeChatRef = db.collection('users').doc(uid).collection('active_chats').doc(sessionId);

        // With unique session IDs, we don't need a destructive "hard reset".
        // New sessions will naturally be new documents.
        const chatDataUpdate: any = {
            id: sessionId,
            uid,
            messages,
            status: 'generating',
            updatedAt: Date.now(),
        };

        if (messages.length === 1) {
            chatDataUpdate.createdAt = Date.now();
        }

        await activeChatRef.set(chatDataUpdate, { merge: true });

        // Kick off the background generation
        waitUntil((async () => {
            let result;
            try {
                console.log(`[MirrorChat] Attempting generation with fallback utility`);
                // Attempt Generation
                result = await generateTextWithFallback({
                    primaryModelId: OPUS_MODEL,
                    fallbackModelId: OPUS_FALLBACK,
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt,
                            providerOptions: {
                                anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } },
                            },
                        },
                        ...messages,
                    ],
                    abortSignal: AbortSignal.timeout(120000)
                });
            } catch (primaryError: any) {
                console.error("Primary Model also failed. Aborting generation.", primaryError.message);
                await activeChatRef.set({
                    status: 'idle', // Reset to idle so user can retry
                    updatedAt: Date.now()
                }, { merge: true });
                return; // Exit early
            }

            // Update Firestore with the successful assistant response
            const finalMessages = [...messages, { role: 'assistant', content: result.text, id: crypto.randomUUID() }];
            await activeChatRef.set({
                messages: finalMessages,
                status: 'idle',
                updatedAt: Date.now()
            }, { merge: true });

        })());

        return Response.json({ success: true, message: "Processing started in background" }, { status: 200 });

    } catch (error: any) {
        console.error("Mirror Chat API Error:", error);

        if (error.name === 'AbortError' || (error.message || '').toString().toLowerCase().includes('timeout') || (error.message || '').toString().toLowerCase().includes('504') || (error.message || '').toString().toLowerCase().includes('503')) {
            return Response.json({
                success: false,
                errorType: 'TIMEOUT',
                message: 'The algorithm is currently taking longer than expected. Please try submitting again.'
            }, { status: 504 });
        }

        return Response.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}
