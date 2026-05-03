import { verifyAuth, unauthorizedResponse } from '@/lib/auth/serverAuth';
import { db } from '@/lib/firebase/admin';
import { saveVoiceFromPreview, deleteVoice } from '@/lib/ai/voiceDesign';

/**
 * POST /api/voice/select
 *
 * Switches the active voice to a different preview from the last compilation.
 * Saves the new preview as a permanent voice in ElevenLabs and deletes the old one.
 *
 * Body: { previewIndex: number }
 */
export async function POST(req: Request) {
    try {
        const uid = await verifyAuth(req);
        if (!uid) return unauthorizedResponse();

        const { previewIndex } = await req.json();

        if (typeof previewIndex !== 'number' || previewIndex < 0 || previewIndex > 2) {
            return Response.json({ error: 'Invalid preview index' }, { status: 400 });
        }

        // Get current bible
        const userDoc = await db.collection('users').doc(uid).get();
        const data = userDoc.data();
        const bible = data?.character_bible;

        if (!bible?.voice_previews || !bible.voice_previews[previewIndex]) {
            return Response.json({ error: 'No voice previews available' }, { status: 400 });
        }

        const preview = bible.voice_previews[previewIndex];
        const oldVoiceId = bible.voice_id;
        const characterName = bible.character_name || 'Character';

        // Save the selected preview as a permanent voice in ElevenLabs
        const newVoiceId = await saveVoiceFromPreview(
            preview.generated_voice_id,
            `${characterName} - Ideal Self`,
            (bible.voice_design_prompt || '').slice(0, 500)
        );

        // Delete the old voice from ElevenLabs
        if (oldVoiceId) {
            await deleteVoice(oldVoiceId);
        }

        // Update bible: set new voice_id and mark selection
        const updatedPreviews = bible.voice_previews.map((p: any, i: number) => ({
            ...p,
            is_selected: i === previewIndex,
        }));

        await db.collection('users').doc(uid).set({
            character_bible: {
                ...bible,
                voice_id: newVoiceId,
                voice_previews: updatedPreviews,
            },
        }, { merge: true });

        return Response.json({ voice_id: newVoiceId });

    } catch (error: any) {
        console.error('[VoiceSelect] Error:', error);
        return Response.json({ error: error.message || 'Unexpected error' }, { status: 500 });
    }
}
