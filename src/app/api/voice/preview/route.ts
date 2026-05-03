import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { db } from '@/lib/firebase/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

/**
 * GET /api/voice/preview?previewId=...
 *
 * Streams a voice preview audio from ElevenLabs without storing base64 in Firestore.
 * Validates the previewId belongs to the authenticated user before streaming.
 */
export async function GET(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const rl = checkRateLimit(`voice-preview:${uid}`, { maxRequests: 20, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const { searchParams } = new URL(req.url);
        const previewId = searchParams.get('previewId');

        if (!previewId || previewId.length < 10) {
            return Response.json({ error: 'Invalid preview ID' }, { status: 400 });
        }

        // Verify this previewId belongs to the user
        const userDoc = await db.collection('users').doc(uid).get();
        const bible = userDoc.data()?.character_bible;
        const previews = bible?.voice_previews || [];
        const isOwned = previews.some((p: any) => p.generated_voice_id === previewId);

        if (!isOwned) {
            return Response.json({ error: 'Preview not found' }, { status: 404 });
        }

        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            return Response.json({ error: 'TTS service not configured' }, { status: 503 });
        }

        // Stream the preview from ElevenLabs
        const previewRes = await fetch(
            `https://api.elevenlabs.io/v1/text-to-voice/${previewId}/stream`,
            { headers: { 'xi-api-key': apiKey } }
        );

        if (!previewRes.ok) {
            return Response.json({ error: 'Preview unavailable' }, { status: 502 });
        }

        return new Response(previewRes.body, {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'private, max-age=3600',
            },
        });

    } catch (error: any) {
        console.error('[VoicePreview] Error:', error);
        return Response.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}
