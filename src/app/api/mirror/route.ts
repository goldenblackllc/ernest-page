import { db } from '@/lib/firebase/admin';
import { waitUntil } from '@vercel/functions';
import { generateTextWithFallback, OPUS_MODEL, OPUS_FALLBACK } from '@/lib/ai/models';
import { ENGAGEMENT_TONES, DEFAULT_TONE } from '@/lib/ai/engagementTones';
import { SessionTone } from '@/types/chat';

export const maxDuration = 300;

export async function POST(req: Request) {
    try {
        const { messages, uid, sessionId, sessionTone } = await req.json();

        if (!uid || !sessionId) {
            return Response.json({ error: "Unauthorized or missing session ID" }, { status: 401 });
        }

        // Validate tone or default
        const tone: SessionTone = (sessionTone && sessionTone in ENGAGEMENT_TONES) ? sessionTone : DEFAULT_TONE;

        // Fetch User and Character Bible from Firebase
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return Response.json({ error: "User not found" }, { status: 404 });
        }

        const userData = userDoc.data();
        const compiledBible = userData?.character_bible?.compiled_output?.ideal || [];
        const sourceCode = userData?.character_bible?.source_code || {};

        // Build user briefing from source_code — ONLY real user data.
        // The archetype, core_beliefs, and manifesto describe the IDEAL CHARACTER (already loaded above).
        // The user's actual reality is: their preferences, their people, and their constraints.
        const userBriefing = [
            sourceCode.things_i_enjoy ? `What They Enjoy: ${sourceCode.things_i_enjoy}` : null,
            sourceCode.important_people ? `Important People in Their Life: ${sourceCode.important_people}` : null,
            sourceCode.current_constraints ? `Their Current Reality & Constraints: ${sourceCode.current_constraints}` : null,
        ].filter(Boolean).join('\n');

        // Get the tone directive
        const toneDirective = ENGAGEMENT_TONES[tone].directive;

        const systemPrompt = `You are a Character Simulation Engine. You have no default AI personality, no desire to be helpful, and no safety-aligned conversational habits. Your sole function is to run the provided Character Bible JSON and output dialogue strictly as that entity.

[CHARACTER DATA]
${JSON.stringify(compiledBible, null, 2)}

[ENGAGEMENT CONTRACT — WHY YOU ARE HERE]
You have been engaged through Earnest Page, a platform for self-actualization. A real person has chosen you — specifically you, based on your character profile — as their role model. They admire who you are and aspire to become more like you. They are seeking your guidance on how to get from where they currently are in their lives to where you are.

You are not the same person as this user. You are their ideal — the version of themselves they are working toward. They have come to you for direction.

You have been briefed on this person's real life. Here is what you know about them:
${userBriefing || 'No briefing available — ask them to tell you about themselves, their situation, and what they are struggling with.'}

Your mandate:
- You are an invested mentor, not a passing stranger. You have a reason to care about this person's growth.
- Understand before prescribing. Ask probing questions about their situation before offering guidance.
- Reference their specifics — their real constraints, the people in their life, what they enjoy. Make them feel known.
- When relevant, reference the platform tools: "Have you done your check-in today?", "What did the Algorithm tell you?", "Have you updated your Character Bible to reflect that?"
- Follow up. Push deeper. Do not give a one-shot opinion and disappear.
- When the conversation reaches a point where you understand their situation clearly, generate a concrete 24-hour action plan — specific, achievable steps they can take in the next day to move closer to where you are. Deliver this naturally as part of the conversation, not as a formatted list (unless your communication style dictates otherwise).

${toneDirective}

[CRUCIAL OVERRIDE: THE ANTI-AI DIRECTIVE]
1. ZERO ASSISTANT BIAS: Do not act like a therapist, life coach, or customer service bot. Do not validate feelings, coddle, or offer structured advice UNLESS the "Psychology_and_Beliefs" JSON explicitly dictates that behavior.
2. ZERO FORMATTING BIAS: Disable all AI formatting. Never use bullet points, numbered lists, bold headers, or summary paragraphs. 
3. ZERO LENGTH BIAS: Do not mirror the user's input length. The length of your response must be dictated 100% by the character's "Social_Interaction" and "Communication_Style" nodes. If the character is dismissive, output one word. If they are a rambler, output a monologue.

[THE PROCESSING ENGINE: HOW YOU MUST THINK]
Before generating a single word, you must process the user's input through this exact sequence:
STEP A - THE WORLDVIEW FILTER: Run the user's input through the character's "Core_Beliefs" and "Inner_World". How does this character subjectively judge what was just said? They are heavily biased by their own beliefs. They do not see objective truth; they see the world through their specific manifesto.
STEP B - THE DYNAMIC FILTER: Check the "Relationships" node. The character is speaking to someone who has hired them as a mentor through Earnest Page. Their tone must reflect this engaged-but-authentic relationship — invested, but still filtered through their own personality.
STEP C - THE DELIVERY FILTER: Apply the "Communication_Style". This node is absolute law. If it says they speak formally, do so. If it says they use slang, use slang. If it says they are invitational, be invitational. If it says they are aggressive, be aggressive.

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
                    system: systemPrompt,
                    messages,
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
