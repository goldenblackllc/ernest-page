import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rateLimit';

export const maxDuration = 30;

// Max characters per TTS request — keeps costs bounded
const MAX_TEXT_LENGTH = 2000;

// Validate voice ID — basic format check, real validation happens at ElevenLabs
function isValidVoiceId(id: string): boolean {
    return typeof id === 'string' && id.length >= 10 && id.length <= 40;
}

export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        // Rate limit: 20 TTS requests per minute per user
        const rl = checkRateLimit(`tts:${uid}`, { maxRequests: 20, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { text, voiceId } = await req.json();

        if (!text || typeof text !== 'string') {
            return Response.json({ error: 'Missing or invalid text' }, { status: 400 });
        }

        if (text.length > MAX_TEXT_LENGTH) {
            return Response.json({
                error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`,
            }, { status: 400 });
        }

        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            return Response.json({ error: 'TTS service not configured' }, { status: 503 });
        }

        if (!voiceId || !isValidVoiceId(voiceId)) {
            return Response.json({ error: 'No voice configured for this character' }, { status: 400 });
        }

        // Call ElevenLabs TTS API
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
                        stability: 0.3,           // Lower = more natural variation, less robotic
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

        // Stream the audio back to the client
        const audioBuffer = await ttsResponse.arrayBuffer();

        return new Response(audioBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': audioBuffer.byteLength.toString(),
                'Cache-Control': 'private, max-age=3600', // Cache for 1 hour client-side
            },
        });

    } catch (error: any) {
        console.error('[TTS] API Error:', error);
        return Response.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}
