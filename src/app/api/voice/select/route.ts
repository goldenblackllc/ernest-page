import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { db } from '@/lib/firebase/admin';

/**
 * POST /api/voice/select
 *
 * Sets the user's active voice to a shared library voice.
 * No ElevenLabs voice creation needed — shared voices are used directly.
 *
 * Body: { voiceId: string, voiceName: string }
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { voiceId, voiceName } = await req.json();

        if (!voiceId || typeof voiceId !== 'string' || voiceId.length < 10) {
            return Response.json({ error: 'Invalid voice ID' }, { status: 400 });
        }

        // Update the user's voice selection
        await db.collection('users').doc(uid).set({
            voice: {
                id: voiceId,
                name: voiceName || '',
            },
            // Keep character_bible in sync for server-side TTS consumers
            character_bible: {
                voice_id: voiceId,
                voice_name: voiceName || '',
            },
        }, { merge: true });

        return Response.json({ voice_id: voiceId });

    } catch (error: any) {
        console.error('[VoiceSelect] Error:', error);
        return Response.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}
