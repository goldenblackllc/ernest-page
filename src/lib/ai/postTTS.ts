import { db, storage } from '@/lib/firebase/admin';

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

/** Reserved Earnest voices */
export const BETH_VOICE_ID = '19STyYD15bswVz51nqLf'; // Female British
// Male British = getEarnestVoiceId() (David's voice from Firestore)

/**
 * Pick the Earnest voice for a user based on gender.
 * Male users hear the British male Earnest; female users hear Beth.
 */
export async function getEarnestVoiceForUser(
    _userVoiceId: string,
    isFemale: boolean,
): Promise<string | null> {
    return isFemale ? BETH_VOICE_ID : await getEarnestVoiceId();
}

/**
 * Fetch a voice's labels (gender, age, accent) from the ElevenLabs API.
 */
async function getVoiceLabels(
    voiceId: string,
    apiKey: string,
): Promise<{ gender?: string; age?: string; accent?: string } | null> {
    try {
        const res = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
            headers: { 'xi-api-key': apiKey },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
            gender: data.labels?.gender?.toLowerCase() || undefined,
            age: data.labels?.age?.toLowerCase() || undefined,
            accent: data.labels?.accent?.toLowerCase() || undefined,
        };
    } catch {
        return null;
    }
}

/**
 * Search the ElevenLabs shared voice library for a voice matching
 * the given labels, excluding any voice IDs in `excludeIds`.
 */
async function findAlternativeVoice(
    labels: { gender?: string; age?: string; accent?: string },
    excludeIds: Set<string>,
    apiKey: string,
): Promise<string | null> {
    const params = new URLSearchParams({
        page_size: '10',
        language: 'en',
        sort: 'usage_character_count_1y',
        ...(labels.gender && { gender: labels.gender }),
        ...(labels.age && { age: labels.age }),
        ...(labels.accent && { accent: labels.accent }),
    });

    try {
        const res = await fetch(
            `https://api.elevenlabs.io/v1/shared-voices?${params}`,
            { headers: { 'xi-api-key': apiKey } },
        );
        if (!res.ok) return null;
        const data = await res.json();
        const candidate = (data.voices || []).find(
            (v: any) => v.voice_id && !excludeIds.has(v.voice_id),
        );
        if (candidate) {
            console.log(`[PostTTS] Found alternative voice: ${candidate.name} (${candidate.voice_id})`);
            return candidate.voice_id;
        }
    } catch (err) {
        console.error('[PostTTS] Alternative voice search failed:', err);
    }
    return null;
}

/**
 * Resolve the two voices for a post's dual-voice audio.
 *
 * Earnest's voice is always the gender-matched British voice.
 * If the user's character voice collides with Earnest's, we find an
 * alternative voice for the user/asker side that matches the same
 * gender, age, and accent — so the swap is seamless.
 *
 * @returns { userVoiceId, earnestVoiceId } — ready to pass to generateConversationAudio
 */
export async function resolvePostVoices(
    userVoiceId: string,
    isFemale: boolean,
): Promise<{ userVoiceId: string; earnestVoiceId: string } | null> {
    const earnestVoiceId = await getEarnestVoiceForUser(userVoiceId, isFemale);
    if (!earnestVoiceId) return null;

    // No collision — use as-is
    if (userVoiceId !== earnestVoiceId) {
        return { userVoiceId, earnestVoiceId };
    }

    // Collision — find an alternative for the user/asker side
    console.log(`[PostTTS] Voice collision: user voice ${userVoiceId} matches Earnest — finding alternative`);
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        console.warn('[PostTTS] No API key — cannot resolve voice collision');
        return { userVoiceId, earnestVoiceId };
    }

    const labels = await getVoiceLabels(userVoiceId, apiKey);
    if (!labels) {
        console.warn('[PostTTS] Could not fetch voice labels — using same voice for both');
        return { userVoiceId, earnestVoiceId };
    }

    // Exclude both Earnest voices so we don't swap into the other one
    const earnestMaleId = await getEarnestVoiceId();
    const excludeIds = new Set(
        [BETH_VOICE_ID, earnestMaleId, userVoiceId].filter(Boolean) as string[],
    );

    const altVoiceId = await findAlternativeVoice(labels, excludeIds, apiKey);
    if (altVoiceId) {
        return { userVoiceId: altVoiceId, earnestVoiceId };
    }

    // Could not find alternative — proceed with same voice (better than no audio)
    console.warn('[PostTTS] No alternative voice found — both sides will use same voice');
    return { userVoiceId, earnestVoiceId };
}

export interface MessageBoundary {
    role: 'user' | 'ideal_self';
    /** Index into the wordTimestamps array where this message starts */
    startIndex: number;
    /** Index into the wordTimestamps array where this message ends (inclusive) */
    endIndex: number;
    /** Start time in seconds */
    startTime: number;
    /** End time in seconds */
    endTime: number;
}

export interface ConversationAudioResult {
    audioUrl: string;
    wordTimestamps: WordTimestamp[];
    messageBoundaries: MessageBoundary[];
}

/**
 * Generate a multi-voice audio file from a condensed transcript conversation.
 *
 * Each message is spoken by the appropriate voice:
 * - 'user' messages → the poster's own voice (userVoiceId)
 * - 'ideal_self' messages → David's voice (male users) or Beth's voice (female users)
 *
 * Messages are concatenated with a brief pause (~300ms silence) between them.
 *
 * @param messages  Array of condensed transcript messages with role and text
 * @param userVoiceId  The post author's ElevenLabs voice ID
 * @param idealSelfVoiceId  The Ideal Self's ElevenLabs voice ID (David or Beth)
 * @param postId  Post document ID (used for storage path)
 * @returns ConversationAudioResult or null if generation fails
 */
export async function generateConversationAudio(
    messages: Array<{ role: 'user' | 'ideal_self'; text: string }>,
    userVoiceId: string,
    idealSelfVoiceId: string,
    postId: string,
): Promise<ConversationAudioResult | null> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        console.error('[PostTTS] ELEVENLABS_API_KEY not configured');
        return null;
    }

    if (!userVoiceId || userVoiceId.length < 10) {
        console.log('[PostTTS] No valid user voice ID — skipping conversation audio');
        return null;
    }

    if (!idealSelfVoiceId || idealSelfVoiceId.length < 10) {
        console.log('[PostTTS] No valid ideal self voice ID — skipping conversation audio');
        return null;
    }

    try {
        const audioBuffers: Buffer[] = [];
        const allTimestamps: WordTimestamp[] = [];
        const messageBoundaries: MessageBoundary[] = [];
        let cumulativeOffset = 0;

        // Generate a real silent MP3 using ffmpeg (1.2 seconds target)
        const SILENCE_DURATION_TARGET = 1.2;
        let silenceBuffer: Buffer | null = null;
        let actualSilenceDuration = SILENCE_DURATION_TARGET;
        try {
            const pathMod = await import('path');
            const { spawnSync } = await import('child_process');
            let ffmpegPath = pathMod.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
            const { existsSync } = await import('fs');
            if (!existsSync(ffmpegPath)) {
                try {
                    const { execSync } = await import('child_process');
                    ffmpegPath = execSync('which ffmpeg', { encoding: 'utf8' }).trim();
                } catch {
                    console.warn('[PostTTS] ffmpeg not found — no silence gaps between messages');
                }
            }
            if (ffmpegPath) {
                const result = spawnSync(ffmpegPath, [
                    '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`,
                    '-t', String(SILENCE_DURATION_TARGET),
                    '-c:a', 'libmp3lame', '-b:a', '128k',
                    '-f', 'mp3', 'pipe:1',
                ], { maxBuffer: 50 * 1024 });
                if (result.status === 0 && result.stdout.length > 0) {
                    silenceBuffer = result.stdout as Buffer;
                    // Calculate actual duration from MP3 bitrate: duration = (bytes * 8) / bitrate
                    actualSilenceDuration = (silenceBuffer.length * 8) / 128000;
                    console.log(`[PostTTS] Silence buffer: ${silenceBuffer.length} bytes, actual duration: ${actualSilenceDuration.toFixed(3)}s`);
                }
            }
        } catch (err: any) {
            console.warn('[PostTTS] Failed to generate silence buffer:', err.message);
        }

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const voiceId = msg.role === 'user' ? userVoiceId : idealSelfVoiceId;
            const cleanText = cleanTextForTTS(msg.text);

            if (!cleanText) continue;

            // Insert silence gap before this message (except the first)
            if (i > 0 && silenceBuffer) {
                audioBuffers.push(silenceBuffer);
                cumulativeOffset += actualSilenceDuration;
            }

            const startIndex = allTimestamps.length;
            const startTime = cumulativeOffset;

            // Generate TTS for this message
            const result = await generateTTSAudio(cleanText, voiceId, apiKey);
            if (!result) {
                console.error(`[PostTTS] Failed to generate audio for message ${i} (${msg.role})`);
                continue;
            }

            // Offset timestamps by cumulative duration
            const offsetTimestamps = result.wordTimestamps.map(w => ({
                word: w.word,
                start: w.start + cumulativeOffset,
                end: w.end + cumulativeOffset,
            }));

            audioBuffers.push(result.buffer);
            allTimestamps.push(...offsetTimestamps);

            // Calculate actual clip duration from buffer size (128kbps MP3)
            // This is more accurate than word timestamps which may not include trailing audio
            const actualClipDuration = (result.buffer.length * 8) / 128000;
            const timestampDuration = result.wordTimestamps.length > 0
                ? result.wordTimestamps[result.wordTimestamps.length - 1].end
                : 0;
            // Use the longer of the two — timestamps tell us word positions,
            // but the actual audio may extend beyond the last word
            const msgDuration = Math.max(actualClipDuration, timestampDuration);
            
            const endIndex = allTimestamps.length - 1;
            const endTime = cumulativeOffset + msgDuration;

            messageBoundaries.push({
                role: msg.role,
                startIndex,
                endIndex: Math.max(startIndex, endIndex),
                startTime,
                endTime,
            });

            cumulativeOffset += msgDuration;

            console.log(`[PostTTS] Message ${i + 1}/${messages.length} (${msg.role}): ${wordCount(cleanText)}w, clip=${actualClipDuration.toFixed(2)}s, timestamps=${timestampDuration.toFixed(2)}s, used=${msgDuration.toFixed(2)}s`);
        }

        if (audioBuffers.length === 0) {
            console.error('[PostTTS] No audio buffers generated for conversation');
            return null;
        }

        // Concatenate all audio buffers (including silence gaps)
        const combinedBuffer = Buffer.concat(audioBuffers);
        const audioUrl = await uploadAudio(combinedBuffer, `post-audio/${postId}_conv_${Date.now()}.mp3`);

        console.log(`[PostTTS] Conversation audio generated for post ${postId}: ${messages.length} messages, ${allTimestamps.length} words`);

        return {
            audioUrl,
            wordTimestamps: allTimestamps,
            messageBoundaries,
        };
    } catch (err) {
        console.error('[PostTTS] Conversation audio generation failed:', err);
        return null;
    }
}

export interface ShortAudioResult {
    /** MP3 buffer for the question portion (character voice) */
    questionBuffer: Buffer;
    /** MP3 buffer for the answer portion (Earnest voice, speed 1.1) */
    answerBuffer: Buffer;
    /** Word-level timestamps for question audio (times relative to question start) */
    questionTimestamps: WordTimestamp[];
    /** Word-level timestamps for answer audio (times relative to answer start) */
    answerTimestamps: WordTimestamp[];
    /** Duration of the question audio in seconds */
    questionDuration: number;
    /** Duration of the answer audio in seconds */
    answerDuration: number;
    /** Firebase Storage URL of the combined (question+answer) audio file */
    audioUrl: string;
}

/**
 * Generate a single TTS audio chunk with an optional speed override.
 * Used internally by generateShortAudio for the Earnest voice at speed 1.1.
 */
async function generateTTSChunkWithSpeed(
    chunk: string,
    voiceId: string,
    apiKey: string,
    timeOffset: number,
    speed: number = 1.0,
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
                    speed,
                },
            }),
        }
    );

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[PostTTS] ElevenLabs error (speed=${speed}): ${res.status}`, errText);
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

    const charEndTimes = json.alignment.character_end_times_seconds;
    const duration = charEndTimes.length > 0 ? charEndTimes[charEndTimes.length - 1] : 0;

    return { audioBuffer, wordTimestamps, duration };
}

/**
 * Retrieve the Earnest (admin) voice ID from Firestore.
 * Falls back to null if ADMIN_UID is not set or voice is not configured.
 */
export async function getEarnestVoiceId(): Promise<string | null> {
    const adminUid = process.env.ADMIN_UID;
    if (!adminUid) {
        console.error('[PostTTS] ADMIN_UID not configured');
        return null;
    }
    const userDoc = await db.collection('users').doc(adminUid).get();
    if (!userDoc.exists) return null;
    return userDoc.data()?.character_bible?.voice_id || null;
}

/**
 * Generate two separate audio tracks for a Q&A short-form video.
 *
 * - Question: spoken by the character's own voice (standard speed)
 * - Answer: spoken by the Earnest voice (speed 1.1 for slightly faster delivery)
 *
 * Both tracks include word-level timestamps for karaoke subtitles.
 * A combined audio file (question + answer) is uploaded to Firebase Storage.
 *
 * @param questionText  The Q&A short question text
 * @param answerText    The Q&A short answer text
 * @param characterVoiceId  The post author's ElevenLabs voice ID
 * @param postId        Post document ID (used for storage path)
 * @returns ShortAudioResult or null if generation fails
 */
export async function generateShortAudio(
    questionText: string,
    answerText: string,
    characterVoiceId: string,
    postId: string,
): Promise<ShortAudioResult | null> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        console.error('[PostTTS] ELEVENLABS_API_KEY not configured');
        return null;
    }

    try {
        // Get the Earnest voice for the answer
        const earnestVoiceId = await getEarnestVoiceId();
        if (!earnestVoiceId) {
            console.error('[PostTTS] Could not retrieve Earnest voice ID');
            return null;
        }

        const cleanQuestion = cleanTextForTTS(questionText);
        const cleanAnswer = cleanTextForTTS(answerText);

        if (!cleanQuestion || !cleanAnswer) {
            console.error('[PostTTS] Empty question or answer text');
            return null;
        }

        // Generate both audio tracks in parallel
        const [questionResult, answerResult] = await Promise.all([
            // Question: character's voice, standard speed
            generateTTSChunkWithTimestamps(cleanQuestion, characterVoiceId, apiKey, 0),
            // Answer: Earnest voice, speed 1.1
            generateTTSChunkWithSpeed(cleanAnswer, earnestVoiceId, apiKey, 0, 1.1),
        ]);

        if (!questionResult || !answerResult) {
            console.error('[PostTTS] Failed to generate one or both short audio tracks');
            return null;
        }

        // Upload combined audio (question + answer concatenated)
        const combinedBuffer = Buffer.concat([questionResult.audioBuffer, answerResult.audioBuffer]);
        const audioUrl = await uploadAudio(combinedBuffer, `short-audio/${postId}_${Date.now()}.mp3`);

        console.log(`[PostTTS] Short audio generated for post ${postId} (question: ${questionResult.duration.toFixed(1)}s, answer: ${answerResult.duration.toFixed(1)}s)`);

        return {
            questionBuffer: questionResult.audioBuffer,
            answerBuffer: answerResult.audioBuffer,
            questionTimestamps: questionResult.wordTimestamps,
            answerTimestamps: answerResult.wordTimestamps,
            questionDuration: questionResult.duration,
            answerDuration: answerResult.duration,
            audioUrl,
        };
    } catch (err) {
        console.error('[PostTTS] Short audio generation failed:', err);
        return null;
    }
}
