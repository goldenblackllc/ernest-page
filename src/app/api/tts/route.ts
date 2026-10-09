import { db, FieldValue } from '@/lib/firebase/admin';
import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { cleanSpeechText, splitTextIntoChunks, TTS_CHUNK_CHARS } from '@/lib/tts/speechText';

export const maxDuration = 120;

/**
 * Characters one user can have spoken per day. Five full sessions of long
 * replies are about 180k, so this only stops scripted abuse (~$0.08 per 1k chars).
 */
export const DAILY_TTS_CHAR_LIMIT = 250_000;

/** Plan messages exist only on the client; their ids start with this. */
const PLAN_MESSAGE_PREFIX = 'plan-';

/**
 * POST /api/tts  { sessionId, messageId, part? }
 * Speaks a reply the Mirror stored in users/{uid}/active_chats/{sessionId}, or,
 * for a plan message, the directives saved to the user's active_todos. The
 * client never sends text, so this can't be used as a general TTS service.
 * Long replies are split into parts; the X-TTS-Parts header gives the count.
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const rl = checkRateLimit(`tts:${uid}`, { maxRequests: 20, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { sessionId, messageId, part = 0 } = await req.json();
        if (typeof sessionId !== 'string' || !sessionId || typeof messageId !== 'string' || !messageId
            || !Number.isInteger(part) || part < 0) {
            return Response.json({ error: 'Missing or invalid message' }, { status: 400 });
        }

        const userRef = db.collection('users').doc(uid);
        const userData = (await userRef.get()).data();
        const voiceId: string | undefined = userData?.voice?.id || userData?.character_bible?.voice_id;
        if (!voiceId) {
            return Response.json({ error: 'No voice configured for this character' }, { status: 400 });
        }

        let sourceText: string | undefined;
        if (messageId.startsWith(PLAN_MESSAGE_PREFIX)) {
            const todos: { task?: string }[] = userData?.active_todos || [];
            sourceText = todos.map(t => t.task).filter(Boolean).join('\n\n');
        } else {
            const chat = (await userRef.collection('active_chats').doc(sessionId).get()).data();
            const message = (chat?.messages || []).find((m: { id?: string; role?: string }) => m?.id === messageId && m?.role === 'assistant');
            sourceText = message?.content;
        }
        if (!sourceText) return Response.json({ error: 'Message not found' }, { status: 404 });

        const chunks = splitTextIntoChunks(cleanSpeechText(sourceText), TTS_CHUNK_CHARS);
        const text = chunks[part];
        if (!text) return Response.json({ error: 'Message not found' }, { status: 404 });

        const today = new Date().toISOString().split('T')[0];
        const usage = userData?.access?.voice_usage;
        const spokenToday = usage?.date === today ? (usage?.chars || 0) : 0;
        if (spokenToday + text.length > DAILY_TTS_CHAR_LIMIT) {
            return Response.json({ error: 'Daily voice limit reached' }, { status: 429 });
        }

        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            return Response.json({ error: 'TTS service not configured' }, { status: 503 });
        }

        const ttsResponse = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
            {
                method: 'POST',
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    model_id: 'eleven_v3',
                    voice_settings: {
                        stability: 0.5,           // Balanced: natural variation with consistent start
                        similarity_boost: 0.8,     // High fidelity to the voice
                        style: 0.45,               // More personality and expressiveness
                        use_speaker_boost: true,
                    },
                }),
            }
        );

        if (!ttsResponse.ok) {
            const errorText = await ttsResponse.text();
            console.error('[TTS] ElevenLabs error:', ttsResponse.status, errorText);

            if (ttsResponse.status === 401) {
                return Response.json({ error: 'TTS authentication failed' }, { status: 503 });
            }
            if (ttsResponse.status === 429) {
                return Response.json({ error: 'TTS rate limit — try again in a moment' }, { status: 429 });
            }
            return Response.json({ error: 'TTS generation failed' }, { status: 502 });
        }

        await userRef.set({
            access: {
                voice_usage: usage?.date === today
                    ? { date: today, chars: FieldValue.increment(text.length) }
                    : { date: today, chars: text.length },
            },
        }, { merge: true });

        const audioBuffer = await ttsResponse.arrayBuffer();

        return new Response(audioBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': audioBuffer.byteLength.toString(),
                'Cache-Control': 'private, max-age=3600', // Cache for 1 hour client-side
                'X-TTS-Parts': String(chunks.length),
            },
        });

    } catch (error: any) {
        console.error('[TTS] API Error:', error);
        return Response.json({ error: 'Unexpected error' }, { status: 500 });
    }
}
