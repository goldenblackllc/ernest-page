/**
 * Subtitle generation for Earnest Page video shorts.
 *
 * Produces timed subtitle entries that ffmpeg draws onto each frame.
 */

export interface SubtitleEntry {
    text: string;
    startTime: number;
    endTime: number;
    phase: 'letter' | 'response';
    words?: { word: string; start: number; end: number }[];
}

/**
 * Break text into sentence-boundary chunks for subtitle display.
 *
 * Each chunk contains complete sentences, targeting approximately `targetWords`
 * words. Chunks always end at a sentence boundary (., !, ?) so the viewer
 * reads complete thoughts — never a dangling fragment like "a casual".
 */
function chunkText(text: string, targetWords = 7): string[] {
    const cleaned = text.replace(/\n+/g, ' ').trim();
    if (!cleaned) return [];

    // Split into sentences — sequences ending with sentence-terminal punctuation
    const sentencePattern = /[^.!?]*[.!?]+[\s]*/g;
    const sentences = cleaned.match(sentencePattern);

    // If no sentence boundaries found, return the whole text as one chunk
    if (!sentences || sentences.length === 0) return [cleaned];

    // Capture any trailing text after the last sentence boundary (e.g. no final period)
    const matchedLength = sentences.reduce((sum, s) => sum + s.length, 0);
    if (matchedLength < cleaned.length) {
        sentences.push(cleaned.slice(matchedLength));
    }

    const chunks: string[] = [];
    let current = '';
    let wordCount = 0;

    for (const sentence of sentences) {
        const sentenceWordCount = sentence.trim().split(/\s+/).filter(Boolean).length;

        if (wordCount > 0 && wordCount + sentenceWordCount > targetWords) {
            chunks.push(current.trim());
            current = sentence;
            wordCount = sentenceWordCount;
        } else {
            current += sentence;
            wordCount += sentenceWordCount;
        }
    }

    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

/**
 * Escape text for ffmpeg drawtext filter.
 * Inside single-quoted values in ffmpeg filter graphs:
 *   \\ → literal \
 *   '' → literal ' (two consecutive quotes = literal quote)
 * Everything else is literal (colons, semicolons, brackets don't need escaping inside quotes).
 * Additionally, drawtext interprets %{...} as dynamic text, so % must become %%.
 */
export function escapeDrawText(text: string): string {
    return text
        .replace(/[\x00-\x1f\x7f]/g, ' ') // strip control chars
        .replace(/[\u2018\u2019\u201a\u201b\u2032\u2035]/g, '') // delete curly/straight single quotes
        .replace(/'/g, '')                  // delete ASCII apostrophes
        .replace(/[\u201c\u201d\u201e\u201f]/g, '"')             // curly double → "
        .replace(/[\u2013\u2014\u2015]/g, '-')                   // em/en dash → -
        .replace(/\u2026/g, '...')                                // ellipsis → ...
        .replace(/[^\x00-\x7f]/g, '')                            // strip remaining non-ASCII
        .replace(/\\/g, '\\\\')             // backslash → \\
        .replace(/:/g, '\\:')               // colon → \: (ffmpeg option separator)
        .replace(/;/g, '\\;')               // semicolon → \; (ffmpeg chain separator)
        .replace(/,/g, '\\,')               // comma → \, (ffmpeg filter separator)
        .replace(/\[/g, '\\[')              // [ → \[ (ffmpeg stream label)
        .replace(/]/g, '\\]')               // ] → \] (ffmpeg stream label)
        .replace(/%/g, '%%');               // % → %%
}

/**
 * Generate timed subtitle entries for the video.
 *
 * @param letterText   The letter body text
 * @param responseText The response body text
 * @param letterDuration  Duration of letter audio in seconds
 * @param responseDuration Duration of response audio in seconds (0 if none)
 * @param wordsPerChunk Number of words per subtitle chunk (default 12)
 * @returns Array of subtitle entries with timing
 */
export function generateSubtitles(
    letterText: string,
    responseText: string,
    letterDuration: number,
    responseDuration: number,
    wordsPerChunk = 7
): SubtitleEntry[] {
    const entries: SubtitleEntry[] = [];

    // Letter subtitles
    const letterChunks = chunkText(letterText, wordsPerChunk);
    if (letterChunks.length > 0 && letterDuration > 0) {
        const chunkDuration = letterDuration / letterChunks.length;
        for (let i = 0; i < letterChunks.length; i++) {
            entries.push({
                text: letterChunks[i],
                startTime: i * chunkDuration,
                endTime: (i + 1) * chunkDuration,
                phase: 'letter',
            });
        }
    }

    // Response subtitles — offset by letter duration
    const responseChunks = chunkText(responseText.replace(/^THE COUNSEL:\s*/i, ''), wordsPerChunk);
    if (responseChunks.length > 0 && responseDuration > 0) {
        const offset = letterDuration;
        const chunkDuration = responseDuration / responseChunks.length;
        for (let i = 0; i < responseChunks.length; i++) {
            entries.push({
                text: responseChunks[i],
                startTime: offset + i * chunkDuration,
                endTime: offset + (i + 1) * chunkDuration,
                phase: 'response',
            });
        }
    }

    return entries;
}

/**
 * Build timed subtitle entries from ElevenLabs word-level timestamps,
 * breaking at sentence boundaries.
 *
 * Accumulates words until both (a) we've reached ~targetWords and
 * (b) the current word ends a sentence (., !, ?). This produces chunks
 * that are complete thoughts with frame-accurate timing.
 *
 * @param wordTimestamps  Array of { word, start, end } from audio_word_timestamps
 * @param targetWords     Minimum words before we'll break at the next sentence end (default 35)
 * @param letterWordCount If provided, forces a chunk break at this word index (letter/response boundary)
 * @returns Array of SubtitleEntry with real timing
 */
export function buildChunksFromTimestamps(
    wordTimestamps: { word: string; start: number; end: number }[],
    targetWords = 7,
    letterWordCount?: number,
): SubtitleEntry[] {
    if (wordTimestamps.length === 0) return [];

    // Filter out ellipsis tokens that leak from TTS separators
    const filtered = wordTimestamps.filter(w => w.word !== '...' && w.word !== '…');
    if (filtered.length === 0) return [];

    const entries: SubtitleEntry[] = [];
    let chunkStart = 0;
    let globalWordIndex = 0; // tracks position across all words for letter/response boundary
    const minWords = 3;      // minimum before allowing a sentence-end break
    const hardCeiling = Math.ceil(targetWords * 1.5); // never exceed this

    for (let i = 0; i < filtered.length; i++) {
        const wordCount = i - chunkStart + 1;
        const word = filtered[i].word;
        globalWordIndex++;

        // Check for sentence-ending punctuation anywhere in the word
        const isSentenceEnd = /[.!?]/.test(word);
        // Check for comma/dash as a secondary break point
        const isNaturalPause = /[,;—–\-]/.test(word);
        const isLastWord = i === filtered.length - 1;

        // Force break at letter/response boundary
        const isLetterResponseBoundary = letterWordCount != null && globalWordIndex === letterWordCount;

        const shouldBreak =
            isLetterResponseBoundary ||
            (isSentenceEnd && wordCount >= minWords) ||
            (isNaturalPause && wordCount >= targetWords) ||
            (wordCount >= hardCeiling) ||
            isLastWord;

        if (shouldBreak) {
            const group = filtered.slice(chunkStart, i + 1);
            const phase = (letterWordCount != null && globalWordIndex <= letterWordCount) ? 'letter' : 'response';
            entries.push({
                text: group.map(w => w.word).join(' '),
                startTime: group[0].start,
                endTime: group[group.length - 1].end,
                phase,
                words: group.map(w => ({ word: w.word, start: w.start, end: w.end })),
            });
            chunkStart = i + 1;
        }
    }

    return entries;
}

/**
 * Format seconds as ASS timestamp: H:MM:SS.CC (centiseconds)
 */
function formatAssTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.round((seconds % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Generate ASS (Advanced SubStation Alpha) subtitle file content.
 * 
 * Uses ffmpeg's `ass` filter (confirmed available) instead of `drawtext`
 * (which is NOT available in the ffmpeg-static Linux binary on Vercel).
 *
 * @param entries Subtitle entries from generateSubtitles()
 * @param totalDuration Total video duration in seconds
 * @returns ASS file content as a string
 */
export function generateAssSubtitles(
    entries: SubtitleEntry[],
    totalDuration: number,
    title: string,
): string {
    const totalEnd = formatAssTime(totalDuration);

    // ASS uses PlayResX/PlayResY for layout coordinates — match 1080×1920 video
    // Alignment codes: 2=bottom-center
    //
    // SOCIAL MEDIA SAFE ZONES (9:16 / 1080×1920):
    //   Top ~500px: platform headers (profile pic, username, search, navigation)
    //   Bottom ~480px: platform footers (username, caption, action buttons, nav bar)
    //   Right ~120px: action buttons (like, comment, share)
    //
    // Typography: HK Grotesk SemiBold — clean geometric sans, refined for subtitles.
    // Parameters tuned for a polished, readable subtitle feel:
    //   - 80pt (smaller than the old 100 — refined, not shouty)
    //   - Warm white (&H00EBF0F5 in ASS BGR) instead of pure white
    //   - 3px outline (thin, just enough contrast against any background)
    //   - 2px shadow at 63% opacity (subtle depth, not "stamped on")
    //   - Spacing: 1 (slight letter-spacing for breathing room)
    const header = `[Script Info]
Title: Earnest Page Video
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,HK Grotesk,100,&H00F5F0EB,&H004DC8FC,&H80000000,&HA0000000,-1,0,0,0,100,100,1,0,1,4,2,2,100,200,350

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

    const events: string[] = [];

    // Timed subtitles — bottom-center, synced to audio
    // \fad(150,100) adds a subtle 150ms fade-in and 100ms fade-out for
    // smooth, cinematic transitions instead of hard text cuts.
    for (const entry of entries) {
        const start = formatAssTime(entry.startTime);
        const end = formatAssTime(entry.endTime);

        if (entry.words && entry.words.length > 0) {
            // Karaoke mode — highlight words one by one using \k (instant flip)
            // \k flips the entire word from SecondaryColour to PrimaryColour at once.
            // (\kf would sweep left-to-right within each word — looks bad.)
            // Override on the first word: \2c = white (unspoken), \1c = gold (spoken).
            const karaokeWords = entry.words.map((w, idx) => {
                const durationCs = Math.round((w.end - w.start) * 100);
                if (idx === 0) {
                    return `{\\1c&H004DC8FC&\\2c&H00F5F0EB&\\k${durationCs}}${escapeAss(w.word)}`;
                }
                return `{\\k${durationCs}}${escapeAss(w.word)}`;
            });
            events.push(`Dialogue: 0,${start},${end},Sub,,0,0,0,,${karaokeWords.join(' ')}`);
        } else {
            // Fallback — plain subtitle with fade
            const text = escapeAss(entry.text);
            events.push(`Dialogue: 0,${start},${end},Sub,,0,0,0,,{\\fad(150,100)}${text}`);
        }
    }

    return header + '\n' + events.join('\n') + '\n';
}

/** Escape ASS special characters */
function escapeAss(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}');
}
