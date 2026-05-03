/**
 * Voice Design — ElevenLabs Custom Voice Generation
 *
 * Generates a unique voice for each character using ElevenLabs' Voice Design API.
 * The voice is designed from a prompt built from the character's manifesto (accent/energy)
 * and the user's identity (ethnic timbre, gender, age).
 *
 * Flow:
 * 1. AI generates an ElevenLabs voice design prompt
 * 2. ElevenLabs creates 3 voice previews
 * 3. First preview is auto-selected and saved as a permanent voice
 * 4. All 3 preview IDs + audio are stored for optional user audition
 */

export interface VoicePreview {
    generated_voice_id: string;
    audio_base64: string;
    media_type: string;
    duration_secs: number;
}

export interface VoiceDesignResult {
    voice_id: string;                // The permanent voice ID (from "create" step)
    voice_design_prompt: string;     // The prompt used to generate it
    previews: VoicePreview[];        // All previews for audition
    selected_preview_index: number;  // Which preview was auto-selected (0-based)
}

const VOICE_DESIGN_ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-voice/design';
const VOICE_CREATE_ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-voice';

/**
 * Generates 3 voice previews from a design prompt.
 * Returns the previews without saving any — caller decides which to save.
 */
export async function generateVoicePreviews(
    voicePrompt: string,
    sampleText?: string
): Promise<VoicePreview[]> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

    const res = await fetch(VOICE_DESIGN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
        },
        body: JSON.stringify({
            voice_description: voicePrompt,
            model_id: 'eleven_multilingual_ttv_v2',
            text: sampleText || 'I see exactly who you are, and I want you to know — you are already enough. Everything you need is already within you.',
            output_format: 'mp3_44100_128',
            loudness: 0,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Voice design failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    return (data.previews || []).map((p: any) => ({
        generated_voice_id: p.generated_voice_id,
        audio_base64: p.audio_base_64,
        media_type: p.media_type || 'audio/mpeg',
        duration_secs: p.duration_secs || 0,
    }));
}

/**
 * Saves a generated voice preview as a permanent voice in our ElevenLabs account.
 * Returns the permanent voice_id that can be used for TTS.
 */
export async function saveVoiceFromPreview(
    generatedVoiceId: string,
    voiceName: string,
    voiceDescription: string
): Promise<string> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

    const res = await fetch(VOICE_CREATE_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
        },
        body: JSON.stringify({
            voice_name: voiceName,
            voice_description: voiceDescription,
            generated_voice_id: generatedVoiceId,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Voice save failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    return data.voice_id;
}

/**
 * Deletes a voice from our ElevenLabs account.
 * Used for cleanup when a user recompiles and gets a new voice.
 */
export async function deleteVoice(voiceId: string): Promise<void> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return;

    try {
        await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
            method: 'DELETE',
            headers: { 'xi-api-key': apiKey },
        });
    } catch (err) {
        console.error('[VoiceDesign] Failed to delete old voice:', err);
    }
}

/**
 * Full voice design flow:
 * 1. Generate 3 previews from the prompt
 * 2. Auto-select the first one
 * 3. Save it as a permanent voice
 * 4. Return all data for storage
 */
export async function designAndSaveVoice(
    voicePrompt: string,
    characterName: string,
    oldVoiceId?: string
): Promise<VoiceDesignResult> {
    // Step 1: Generate previews
    const previews = await generateVoicePreviews(voicePrompt);

    if (previews.length === 0) {
        throw new Error('No voice previews generated');
    }

    // Step 2: Auto-select first preview
    const selectedIndex = 0;
    const selectedPreview = previews[selectedIndex];

    // Step 3: Save to ElevenLabs as a permanent voice
    const voiceId = await saveVoiceFromPreview(
        selectedPreview.generated_voice_id,
        `${characterName} - Ideal Self`,
        voicePrompt.slice(0, 500)
    );

    // Step 4: Clean up old voice if replacing
    if (oldVoiceId) {
        await deleteVoice(oldVoiceId);
    }

    return {
        voice_id: voiceId,
        voice_design_prompt: voicePrompt,
        previews,
        selected_preview_index: selectedIndex,
    };
}
