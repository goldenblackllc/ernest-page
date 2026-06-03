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
}

/**
 * Break text into word-based chunks for subtitle display.
 */
function chunkText(text: string, wordsPerChunk = 12): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
        chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }
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
    wordsPerChunk = 12
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
    authorName: string,
    timestamp: string,
    hasAvatar: boolean,
): string {
    const totalEnd = formatAssTime(totalDuration);
    // Author text x-position depends on avatar presence (avatar is 80px + 20px gap)
    const authorMarginL = hasAvatar ? 140 : 40;

    // ASS uses PlayResX/PlayResY for layout coordinates — match 1080×1920 video
    // Alignment codes: 7=top-left, 8=top-center, 9=top-right, 1=bot-left, 2=bot-center
    const header = `[Script Info]
Title: Earnest Page Video
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Author,HK Grotesk,34,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,0,2,7,${authorMarginL},40,100
Style: Timestamp,HK Grotesk,24,&H80FFFFFF,&H80FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,1,7,${authorMarginL},40,135
Style: Title,HK Grotesk,58,&H00FFFFFF,&H00FFFFFF,&H00000000,&HCC000000,1,0,0,0,100,100,0,0,1,0,4,7,40,40,210
Style: Sub,HK Grotesk,54,&H00FFFFFF,&H00FFFFFF,&H00000000,&HB4000000,0,0,0,0,100,100,0,0,1,2,3,2,40,40,180

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

    const events: string[] = [];

    // Static text — visible for entire video
    const escapedAuthor = escapeAss(authorName);
    const escapedTimestamp = escapeAss(timestamp);
    const escapedTitle = escapeAss(title);

    events.push(`Dialogue: 0,0:00:00.00,${totalEnd},Author,,0,0,0,,${escapedAuthor}`);
    events.push(`Dialogue: 0,0:00:00.00,${totalEnd},Timestamp,,0,0,0,,${escapedTimestamp}`);
    events.push(`Dialogue: 0,0:00:00.00,${totalEnd},Title,,0,0,0,,${escapedTitle}`);

    // Timed subtitles
    for (const entry of entries) {
        const start = formatAssTime(entry.startTime);
        const end = formatAssTime(entry.endTime);
        const text = escapeAss(entry.text);
        events.push(`Dialogue: 0,${start},${end},Sub,,0,0,0,,${text}`);
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
