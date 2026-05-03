import { db } from '@/lib/firebase/admin';
import { generateVoiceDesignPrompt } from '@/lib/ai/voiceCatalog';
import { designAndSaveVoice } from '@/lib/ai/voiceDesign';

export const maxDuration = 120;

/**
 * POST /api/voice/design
 *
 * Background voice design endpoint — called fire-and-forget from compile.
 * Reads the user's bible, generates a voice design prompt, creates 3 previews,
 * auto-selects the first, and saves it back to the bible.
 *
 * Protected by internal key (same as cron jobs).
 */
export async function POST(req: Request) {
    try {
        const internalKey = req.headers.get('x-internal-key');
        if (internalKey !== process.env.CRON_SECRET) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { uid } = await req.json();
        if (!uid) {
            return Response.json({ error: 'Missing uid' }, { status: 400 });
        }

        // Read current bible
        const userDoc = await db.collection('users').doc(uid).get();
        const data = userDoc.data();
        const bible = data?.character_bible;

        if (!bible?.source_code?.manifesto) {
            return Response.json({ error: 'No bible found' }, { status: 400 });
        }

        const identity = data?.identity || {};

        // Step 1: AI generates the ElevenLabs voice design prompt
        const voiceDesignPrompt = await generateVoiceDesignPrompt({
            manifesto: bible.source_code.manifesto || '',
            archetype: bible.source_code.archetype || '',
            characterName: bible.character_name || 'Character',
            gender: identity.gender || '',
            age: identity.age || '',
            ethnicity: identity.ethnicity || '',
            appLanguage: 'en',
        });

        console.log('[VoiceDesign] Prompt:', voiceDesignPrompt);

        // Step 2: Generate previews, auto-select first, save to ElevenLabs
        const oldVoiceId = bible.voice_id;
        const result = await designAndSaveVoice(
            voiceDesignPrompt,
            bible.character_name || 'Character',
            oldVoiceId
        );

        // Step 3: Update bible with new voice data
        const voicePreviews = result.previews.map((p, i) => ({
            generated_voice_id: p.generated_voice_id,
            audio_base64: p.audio_base64,
            duration_secs: p.duration_secs,
            is_selected: i === result.selected_preview_index,
        }));

        await db.collection('users').doc(uid).set({
            character_bible: {
                ...bible,
                voice_id: result.voice_id,
                voice_design_prompt: voiceDesignPrompt,
                voice_previews: voicePreviews,
            },
        }, { merge: true });

        console.log('[VoiceDesign] Complete — voice_id:', result.voice_id);
        return Response.json({ voice_id: result.voice_id });

    } catch (error: any) {
        console.error('[VoiceDesign] Error:', error);
        return Response.json({ error: error.message || 'Voice design failed' }, { status: 500 });
    }
}
