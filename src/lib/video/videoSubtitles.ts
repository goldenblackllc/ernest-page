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
        .replace(/[\x00-\x1f\x7f]/g, ' ') // strip ALL control chars
        // Normalize common Unicode punctuation to ASCII equivalents
        .replace(/[\u2018\u2019\u201a\u201b]/g, "'") // curly single quotes → '
        .replace(/[\u201c\u201d\u201e\u201f]/g, '"') // curly double quotes → "
        .replace(/[\u2013\u2014\u2015]/g, '-')        // en/em dash → hyphen
        .replace(/\u2026/g, '...')                     // ellipsis → ...
        .replace(/[^\x00-\x7f]/g, '')                 // strip remaining non-ASCII
        .replace(/\\/g, '\\\\')             // backslash → escaped backslash
        .replace(/'/g, '\u2019')            // remaining ' → Unicode right single quote (not ASCII 0x27)
        .replace(/%/g, '%%');               // percent → escaped percent
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
