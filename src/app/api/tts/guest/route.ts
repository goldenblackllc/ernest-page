import { db } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

export const maxDuration = 120;

const MAX_TEXT_LENGTH = 5000;

function isValidVoiceId(id: string): boolean {
    return typeof id === 'string' && id.length >= 10 && id.length <= 40;
}

export async function POST(req: Request) {
    try {
        // ─── Extract IP for rate limiting ───
        const forwarded = req.headers.get('x-forwarded-for');
        const ip = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';

        // ─── IP-based rate limiting: 20 TTS per minute ───
        const rl = checkRateLimit(`guest-tts:${ip}`, { maxRequests: 20, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        // ─── Load admin character's voice_id ───
        const adminUid = process.env.ADMIN_UID;
        if (!adminUid) {
            return Response.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const userDoc = await db.collection('users').doc(adminUid).get();
        if (!userDoc.exists) {
            return Response.json({ error: 'Character not found' }, { status: 500 });
        }

        const userData = userDoc.data();
        const voiceId = userData?.character_bible?.voice_id;

        if (!voiceId || !isValidVoiceId(voiceId)) {
            return Response.json({ error: 'No voice configured' }, { status: 400 });
        }

        // ─── Validate text ───
        const { text } = await req.json();

        if (!text || typeof text !== 'string') {
            return Response.json({ error: 'Missing or invalid text' }, { status: 400 });
        }

        if (text.length > MAX_TEXT_LENGTH) {
            return Response.json({ error: `Text exceeds ${MAX_TEXT_LENGTH} characters` }, { status: 400 });
        }

        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            return Response.json({ error: 'TTS service not configured' }, { status: 503 });
        }

        // ─── Call ElevenLabs ───
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
                        stability: 0.5,
                        similarity_boost: 0.8,
                        style: 0.45,
                        use_speaker_boost: true,
                    },
                }),
            }
        );

        if (!ttsResponse.ok) {
            const errorText = await ttsResponse.text();
            console.error('[Guest TTS] ElevenLabs error:', ttsResponse.status, errorText);

            if (ttsResponse.status === 429) {
                return Response.json({ error: 'TTS rate limit — try again in a moment' }, { status: 429 });
            }
            return Response.json({ error: 'TTS generation failed' }, { status: 502 });
        }

        const audioBuffer = await ttsResponse.arrayBuffer();

        return new Response(audioBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': audioBuffer.byteLength.toString(),
                'Cache-Control': 'private, max-age=3600',
            },
        });

    } catch (error: any) {
        console.error('[Guest TTS] API Error:', error);
        return Response.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}
