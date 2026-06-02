/**
 * Video Subtitle Timing — calculates timed subtitle entries for ffmpeg drawtext filters.
 *
 * Splits letter and response text into ~12-word chunks (matching the web player)
 * and distributes them evenly across their respective audio durations.
 */

export interface SubtitleEntry {
    text: string;
    startTime: number; // seconds from video start
    endTime: number;   // seconds from video start
    phase: 'letter' | 'response';
}

/**
 * Split text into chunks of roughly `wordsPerChunk` words.
 */
function chunkText(text: string, wordsPerChunk = 12): string[] {
    const words = text.replace(/\n+/g, ' ').split(/\s+/).filter(w => w);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
        chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }
    return chunks;
}

/**
 * Escape text for ffmpeg drawtext filter (filter_complex_script context, no shell).
 * Inside single-quoted values in ffmpeg filter graphs:
 *   \\ → literal \
 *   \' → literal '
 * Everything else is literal (colons, semicolons, brackets don't need escaping inside quotes).
 * Additionally, drawtext interprets %{...} as dynamic text, so % must become %%.
 */
export function escapeDrawText(text: string): string {
    return text
        .replace(/\\/g, () => '\\\\')        // backslash → literal backslash
        .replace(/'/g, '\u2019')             // apostrophe → Unicode right single quote (avoids ffmpeg filter quoting issues)
        .replace(/%/g, () => '%%')           // percent → escaped percent (drawtext expansion)
        .replace(/\n/g, () => ' ');          // newlines → space
}

/**
 * Generate timed subtitle entries for the video.
 *
 * @param letterText   The letter body text
 * @param responseText The response body text
 * @param letterDuration  Duration of letter audio in seconds
 * @param responseDuration Duration of response audio in seconds (0 if none)
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
