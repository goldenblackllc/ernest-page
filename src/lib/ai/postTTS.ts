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
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_192`,
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
            // Use actual MP3 buffer duration (not just last-character timestamp)
            // to account for trailing silence and MP3 frame padding that
            // accumulates across chunks and causes subtitle drift.
            const actualClipDuration = (result.audioBuffer.length * 8) / 192000;
            cumulativeOffset += Math.max(actualClipDuration, result.duration);
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
 * Search the ElevenLabs shared voice library for a conversational voice
 * matching the given labels, excluding any voice IDs in `excludeIds`.
 * Randomly picks from the top `pickFromTop` results for variety.
 *
 * NOTE: The API's `use_cases` query param doesn't reliably filter by the
 * voice's actual `use_case` field. We fetch without that param and filter
 * client-side by `use_case === "conversational"` to match the website.
 */
async function findConversationalVoice(
    labels: { gender?: string; age?: string; accent?: string },
    excludeIds: Set<string>,
    apiKey: string,
    pickFromTop: number = 5,
    language: string = 'en',
): Promise<string | null> {
    // Progressive relaxation: try full filters first, then drop accent, then
    // age, then just gender. This ensures we always find a match.
    const filterSets = [
        { ...(labels.gender && { gender: labels.gender }), ...(labels.age && { age: labels.age }), ...(labels.accent && { accent: labels.accent }) },
        { ...(labels.gender && { gender: labels.gender }), ...(labels.age && { age: labels.age }) },
        { ...(labels.gender && { gender: labels.gender }) },
        {},
    ];

    for (let i = 0; i < filterSets.length; i++) {
        const params = new URLSearchParams({
            page_size: '50',
            language,
            category: 'high_quality',
            sort: 'usage_character_count_1y',
            ...filterSets[i],
        });

        try {
            const res = await fetch(
                `https://api.elevenlabs.io/v1/shared-voices?${params}`,
                { headers: { 'xi-api-key': apiKey } },
            );
            if (!res.ok) continue;
            const data = await res.json();
            const candidates = (data.voices || [])
                .filter((v: any) =>
                    v.voice_id &&
                    !excludeIds.has(v.voice_id) &&
                    v.use_case === 'conversational',
                )
                .slice(0, pickFromTop);
            if (candidates.length > 0) {
                const pick = candidates[Math.floor(Math.random() * candidates.length)];
                const relaxed = i > 0 ? ` (relaxed filters: attempt ${i + 1}/4)` : '';
                console.log(`[PostTTS] Found conversational voice: ${pick.name} (${pick.voice_id}) — picked from ${candidates.length} candidates${relaxed}`);
                return pick.voice_id;
            }
        } catch (err) {
            console.error('[PostTTS] Conversational voice search failed:', err);
        }
    }

    return null;
}

/**
 * Resolve the two voices for a post's dual-voice conversation audio.
 *
 * The character's own custom voice is used for ideal_self messages.
 * For the questioner (user messages), we search ElevenLabs' shared voice
 * library for a conversational voice matching the character's gender, age,
 * and accent — then randomly pick from the top 5 results.
 *
 * @param characterVoiceId  The character's custom ElevenLabs voice ID
 * @param language  The language code for the questioner voice (default 'en')
 * @returns { characterVoiceId, questionerVoiceId } — ready to pass to generateConversationAudio
 */
export async function resolveConversationVoices(
    characterVoiceId: string,
    language: string = 'en',
): Promise<{ characterVoiceId: string; questionerVoiceId: string } | null> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        console.warn('[PostTTS] No API key — cannot resolve questioner voice');
        return null;
    }

    const labels = await getVoiceLabels(characterVoiceId, apiKey);
    if (!labels) {
        console.warn('[PostTTS] Could not fetch character voice labels — using character voice for both');
        return { characterVoiceId, questionerVoiceId: characterVoiceId };
    }

    const excludeIds = new Set([characterVoiceId]);
    const questionerVoiceId = await findConversationalVoice(labels, excludeIds, apiKey, 5, language);

    if (questionerVoiceId) {
        return { characterVoiceId, questionerVoiceId };
    }

    // Fallback: use character voice for both (better than no audio)
    console.warn('[PostTTS] No conversational voice found — using character voice for both');
    return { characterVoiceId, questionerVoiceId: characterVoiceId };
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
 * - 'user' messages → questionerVoiceId (random conversational voice)
 * - 'ideal_self' messages → characterVoiceId (the character's own custom voice)
 *
 * Messages are concatenated with a brief pause (~1.2s silence) between them.
 *
 * @param messages  Array of condensed transcript messages with role and text
 * @param questionerVoiceId  ElevenLabs voice ID for the questioner (user messages)
 * @param characterVoiceId  The character's custom ElevenLabs voice ID (ideal_self messages)
 * @param postId  Post document ID (used for storage path)
 * @returns ConversationAudioResult or null if generation fails
 */
export async function generateConversationAudio(
    messages: Array<{ role: 'user' | 'ideal_self'; text: string }>,
    questionerVoiceId: string,
    characterVoiceId: string,
    postId: string,
): Promise<ConversationAudioResult | null> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        console.error('[PostTTS] ELEVENLABS_API_KEY not configured');
        return null;
    }

    if (!questionerVoiceId || questionerVoiceId.length < 10) {
        console.log('[PostTTS] No valid questioner voice ID — skipping conversation audio');
        return null;
    }

    if (!characterVoiceId || characterVoiceId.length < 10) {
        console.log('[PostTTS] No valid character voice ID — skipping conversation audio');
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
                    '-c:a', 'libmp3lame', '-b:a', '192k',
                    '-f', 'mp3', 'pipe:1',
                ], { maxBuffer: 50 * 1024 });
                if (result.status === 0 && result.stdout.length > 0) {
                    silenceBuffer = result.stdout as Buffer;
                    // Calculate actual duration from MP3 bitrate: duration = (bytes * 8) / bitrate
                    actualSilenceDuration = (silenceBuffer.length * 8) / 192000;
                    console.log(`[PostTTS] Silence buffer: ${silenceBuffer.length} bytes, actual duration: ${actualSilenceDuration.toFixed(3)}s`);
                }
            }
        } catch (err: any) {
            console.warn('[PostTTS] Failed to generate silence buffer:', err.message);
        }

        // ─── PARALLEL-BY-VOICE TTS ───
        // ElevenLabs rejects concurrent requests on the SAME voice (409).
        // Solution: group messages by voice, run each voice's messages sequentially,
        // but process both voice streams in parallel. ~2x faster than fully sequential.
        const ttsInputs = messages.map((msg, i) => ({
            index: i,
            role: msg.role,
            voiceId: msg.role === 'user' ? questionerVoiceId : characterVoiceId,
            cleanText: cleanTextForTTS(msg.text),
        })).filter(m => !!m.cleanText);

        console.log(`[PostTTS] Generating ${ttsInputs.length} TTS clips (parallel-by-voice)...`);
        const ttsResultMap = new Map<number, Awaited<ReturnType<typeof generateTTSAudio>>>();

        // Group by voice
        const voiceGroups = new Map<string, typeof ttsInputs>();
        for (const input of ttsInputs) {
            const group = voiceGroups.get(input.voiceId) || [];
            group.push(input);
            voiceGroups.set(input.voiceId, group);
        }

        // Process each voice's messages sequentially, but run voices in parallel
        const voiceStreams = [...voiceGroups.entries()].map(async ([voiceId, inputs]) => {
            for (const { index, cleanText } of inputs) {
                // Try up to 2 times (initial + 1 retry on 409)
                let result: Awaited<ReturnType<typeof generateTTSAudio>> = null;
                for (let attempt = 0; attempt < 2; attempt++) {
                    result = await generateTTSAudio(cleanText!, voiceId, apiKey);
                    if (result) break;
                    if (attempt === 0) {
                        console.log(`[PostTTS] Retrying message ${index} after 1s...`);
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
                if (result) {
                    ttsResultMap.set(index, result);
                }
            }
        });

        await Promise.all(voiceStreams);
        console.log(`[PostTTS] ${ttsResultMap.size}/${ttsInputs.length} TTS calls succeeded`);

        // ─── SEQUENTIAL STITCH: Assemble in order with timestamps ───
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const result = ttsResultMap.get(i);
            if (!result) {
                console.error(`[PostTTS] No audio for message ${i} (${msg.role}) — skipping`);
                continue;
            }

            // Insert silence gap before this message (except the first)
            if (audioBuffers.length > 0 && silenceBuffer) {
                audioBuffers.push(silenceBuffer);
                cumulativeOffset += actualSilenceDuration;
            }

            const startIndex = allTimestamps.length;
            const startTime = cumulativeOffset;

            // Offset timestamps by cumulative duration
            const offsetTimestamps = result.wordTimestamps.map(w => ({
                word: w.word,
                start: w.start + cumulativeOffset,
                end: w.end + cumulativeOffset,
            }));

            audioBuffers.push(result.buffer);
            allTimestamps.push(...offsetTimestamps);

            // Calculate actual clip duration from buffer size (192kbps MP3)
            const actualClipDuration = (result.buffer.length * 8) / 192000;
            const timestampDuration = result.wordTimestamps.length > 0
                ? result.wordTimestamps[result.wordTimestamps.length - 1].end
                : 0;
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

            const cleanText = cleanTextForTTS(msg.text);
            console.log(`[PostTTS] Message ${i + 1}/${messages.length} (${msg.role}): ${wordCount(cleanText || '')}w, clip=${actualClipDuration.toFixed(2)}s, used=${msgDuration.toFixed(2)}s`);
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

