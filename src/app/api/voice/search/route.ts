import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

export const maxDuration = 15;

/**
 * GET /api/voice/search?gender=female&age=middle_aged&accent=american&q=warm
 *
 * Proxies the ElevenLabs shared voice library search.
 * Returns voices matching the given filters with preview URLs.
 * Shared voices are free to use — no custom voice slots consumed.
 */
export async function GET(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const rl = checkRateLimit(`voice-search:${uid}`, { maxRequests: 30, windowMs: 60_000 });
        if (!rl.allowed) return rateLimitResponse(rl.resetMs);

        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
            return Response.json({ error: 'TTS service not configured' }, { status: 503 });
        }

        const { searchParams } = new URL(req.url);
        const gender = searchParams.get('gender') || '';
        const age = searchParams.get('age') || '';
        const accent = searchParams.get('accent') || '';
        const query = searchParams.get('q') || '';
        const language = searchParams.get('language') || 'en';

        // Build ElevenLabs shared voices URL
        const params = new URLSearchParams({
            page_size: '24',
            language,
            sort: 'usage_character_count_1y',
            ...(gender && { gender }),
            ...(age && { age }),
            ...(accent && { accent }),
            ...(query && { search: query }),
        });

        const res = await fetch(
            `https://api.elevenlabs.io/v1/shared-voices?${params}`,
            { headers: { 'xi-api-key': apiKey } }
        );

        if (!res.ok) {
            return Response.json({ error: 'Voice search failed' }, { status: 502 });
        }

        const data = await res.json();

        // Return only the fields the client needs
        const voices = (data.voices || []).map((v: any) => ({
            voice_id: v.voice_id,
            name: v.name,
            accent: v.accent || '',
            age: v.age || '',
            gender: v.gender || '',
            category: v.category || '',
            description: (v.description || '').slice(0, 200),
            preview_url: v.preview_url || '',
        }));

        return Response.json({ voices });

    } catch (error: any) {
        console.error('[VoiceSearch] Error:', error);
        return Response.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}
