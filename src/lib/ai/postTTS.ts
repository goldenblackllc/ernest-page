import { storage } from '@/lib/firebase/admin';

/**
 * Generate TTS audio for a Dear Earnest post using ElevenLabs.
 *
 * Produces a SINGLE audio file containing the letter + response read
 * continuously in one ElevenLabs call, ensuring seamless prosodic flow.
 *
 * The character's own voice_id is used, maintaining the
 * Ideal Self's sonic identity across the entire post.
 */

const MAX_CHUNK_LENGTH = 4800; // Leave margin under ElevenLabs' 5000 char limit

/**
 * Split text into chunks at sentence boundaries to stay within ElevenLabs limits.
 */
function splitTextIntoChunks(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }

        let splitAt = -1;
        const searchRegion = remaining.slice(0, maxLen);

        // Prefer splitting at sentence boundaries
        for (let i = searchRegion.length - 1; i >= Math.floor(maxLen * 0.5); i--) {
            if ((searchRegion[i] === '.' || searchRegion[i] === '!' || searchRegion[i] === '?')
                && (i + 1 >= searchRegion.length || searchRegion[i + 1] === ' ')) {
                splitAt = i + 1;
                break;
            }
        }

        // Fallback: split at last space
        if (splitAt === -1) {
            splitAt = searchRegion.lastIndexOf(' ');
        }

        // Last resort: hard split
        if (splitAt <= 0) {
            splitAt = maxLen;
        }

        chunks.push(remaining.slice(0, splitAt).trim());
        remaining = remaining.slice(splitAt).trim();
    }

    return chunks.filter(c => c.length > 0);
}

/**
 * Strip markdown formatting for cleaner TTS output.
 */
function cleanTextForTTS(text: string): string {
    return text
        .replace(/\\n/g, ' ')                      // strip literal '\n' from AI JSON artifacts
        .replace(/[#*_~`>]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim();
}

/**
 * Count words in a text string.
 */
function wordCount(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
}

export interface WordTimestamp {
    word: string;
    start: number;  // seconds
    end: number;    // seconds
}

interface ChunkResult {
    audioBuffer: Buffer;
    wordTimestamps: WordTimestamp[];
    /** End time of the last character in this chunk (used as offset for subsequent chunks) */
    duration: number;
}

/**
 * Parse character-level alignment data into word-level timestamps.
 * Groups consecutive non-space characters into words, using each word's
 * first character start time and last character end time.
 */
function parseWordTimestamps(
    characters: string[],
    startTimes: number[],
    endTimes: number[],
    timeOffset: number,
): WordTimestamp[] {
    const words: WordTimestamp[] = [];
    let currentWord = '';
    let wordStart = -1;
    let wordEnd = -1;

    for (let i = 0; i < characters.length; i++) {
        const ch = characters[i];
        if (ch === ' ' || ch === '\n' || ch === '\t') {
            // Whitespace — flush current word if any
            if (currentWord.length > 0) {
                words.push({
                    word: currentWord,
                    start: wordStart + timeOffset,
                    end: wordEnd + timeOffset,
                });
                currentWord = '';
                wordStart = -1;
                wordEnd = -1;
            }
        } else {
            if (currentWord.length === 0) {
                wordStart = startTimes[i];
            }
            wordEnd = endTimes[i];
            currentWord += ch;
        }
    }

    // Flush trailing word
    if (currentWord.length > 0) {
        words.push({
            word: currentWord,
            start: wordStart + timeOffset,
            end: wordEnd + timeOffset,
        });
    }

    return words;
}

/**
 * Generate TTS audio with word-level timestamps from a single text chunk
 * using the ElevenLabs /with-timestamps endpoint.
 */
async function generateTTSChunkWithTimestamps(
    chunk: string,
    voiceId: string,
    apiKey: string,
    timeOffset: number,
): Promise<ChunkResult | null> {
    const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
        {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: chunk,
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

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[PostTTS] ElevenLabs error: ${res.status}`, errText);
        return null;
    }

    const json = await res.json() as {
        audio_base64: string;
        alignment: {
            characters: string[];
            character_start_times_seconds: number[];
            character_end_times_seconds: number[];
        };
    };

    const audioBuffer = Buffer.from(json.audio_base64, 'base64');

    const wordTimestamps = parseWordTimestamps(
        json.alignment.characters,
        json.alignment.character_start_times_seconds,
        json.alignment.character_end_times_seconds,
        timeOffset,
    );

    // Duration = last character's end time (before applying offset)
    const charEndTimes = json.alignment.character_end_times_seconds;
    const duration = charEndTimes.length > 0 ? charEndTimes[charEndTimes.length - 1] : 0;

    return { audioBuffer, wordTimestamps, duration };
}

/**
 * Generate a single audio file from text using ElevenLabs TTS with timestamps.
 * Handles chunking for long text and concatenates the results.
 */
async function generateTTSAudio(
    text: string,
    voiceId: string,
    apiKey: string,
): Promise<{ buffer: Buffer; wordTimestamps: WordTimestamp[] } | null> {
    const cleanText = cleanTextForTTS(text);
    if (!cleanText) return null;

    const chunks = splitTextIntoChunks(cleanText, MAX_CHUNK_LENGTH);
    const audioBuffers: Buffer[] = [];
    const allTimestamps: WordTimestamp[] = [];
    let cumulativeOffset = 0;

    for (const chunk of chunks) {
        try {
            const result = await generateTTSChunkWithTimestamps(chunk, voiceId, apiKey, cumulativeOffset);
            if (!result) break;

            audioBuffers.push(result.audioBuffer);
            allTimestamps.push(...result.wordTimestamps);
            cumulativeOffset += result.duration;
        } catch (err) {
            console.error('[PostTTS] TTS chunk failed:', err);
            break;
        }
    }

    if (audioBuffers.length === 0) return null;

    const buffer = audioBuffers.length === 1
        ? audioBuffers[0]
        : Buffer.concat(audioBuffers);

    return { buffer, wordTimestamps: allTimestamps };
}

/**
 * Upload an audio buffer to Firebase Storage and return the public URL.
 */
async function uploadAudio(buffer: Buffer, path: string): Promise<string> {
    const bucket = storage.bucket();
    const file = bucket.file(path);

    await file.save(buffer, {
        metadata: { contentType: 'audio/mpeg' },
    });

    // Try to make public; skip silently if Uniform Bucket-Level Access is on
    try { await file.makePublic(); } catch { /* UBLA enabled */ }

    return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

/**
 * Generate TTS audio for a complete Dear Earnest post.
 *
 * Combines letter + response into a single ElevenLabs call so the voice
 * maintains natural prosody across both sections (no choppy seam).
 *
 * @param letterText  The anonymous letter text
 * @param verdict  Optional verdict/hook text to prepend (read aloud first)
 * @param responseText  The Ideal Self's response text
 * @param voiceId  ElevenLabs voice ID (from character bible)
 * @param postId  Post document ID (used for storage path)
 * @returns Object with combined audio URL, letter word ratio, and word timestamps, or null if generation fails
 */
export async function generatePostAudio(
    letterText: string,
    responseText: string,
    voiceId: string,
    postId: string,
    verdict?: string,
): Promise<{ audioUrl: string; letterWordRatio: number; wordTimestamps: WordTimestamp[] } | null> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        console.error('[PostTTS] ELEVENLABS_API_KEY not configured');
        return null;
    }

    if (!voiceId || voiceId.length < 10) {
        console.log('[PostTTS] No valid voice ID — skipping audio generation');
        return null;
    }

    try {
        // Combine letter + response into a single text for one continuous TTS pass.
        // The em-dash sign-offs (— Pseudonym / — Earnest Page) create natural prosodic
        // pauses between the two sections.
        const cleanLetter = cleanTextForTTS(letterText);
        const cleanResponse = responseText ? cleanTextForTTS(responseText) : '';
        const combinedText = [cleanLetter, cleanResponse]
            .filter(Boolean)
            .join(' ... ');

        // Calculate letter word ratio for phase boundary estimation during playback.
        const letterWords = wordCount(cleanLetter);
        const totalWords = letterWords + (cleanResponse ? wordCount(cleanResponse) : 0);
        const letterWordRatio = totalWords > 0 ? letterWords / totalWords : 1;

        const audioResult = await generateTTSAudio(combinedText, voiceId, apiKey);

        if (!audioResult) {
            console.error('[PostTTS] Failed to generate combined audio track');
            return null;
        }

        // Upload single combined file
        const audioUrl = await uploadAudio(audioResult.buffer, `post-audio/${postId}_${Date.now()}.mp3`);

        console.log(`[PostTTS] Audio generated for post ${postId} (letter ratio: ${letterWordRatio.toFixed(2)}, words: ${audioResult.wordTimestamps.length})`);
        return { audioUrl, letterWordRatio, wordTimestamps: audioResult.wordTimestamps };
    } catch (err) {
        console.error('[PostTTS] Audio generation failed:', err);
        return null;
    }
}
