import type { WordTimestamp } from "@/types/post";
import type { AudioPhase } from "@/hooks/useFeedAudio";

interface TimestampChunk {
    text: string;
    start: number;
    end: number;
    words: WordTimestamp[];
}

export interface Subtitle {
    current: string;
    next: string;
    lineIndex: number;
    totalLines: number;
    words?: WordTimestamp[];
    activeWordIndex?: number;
}

/** Split text into sentence-boundary chunks — each chunk is a complete thought. */
function chunkText(text: string, targetWords: number = 12): string[] {
    // Strip both literal '\n' strings (AI JSON artifacts) and real newlines
    const cleaned = text.replace(/\\n/g, ' ').replace(/\n+/g, ' ').trim();
    if (!cleaned) return [''];

    const sentencePattern = /[^.!?]*[.!?]+[\s]*/g;
    const sentences = cleaned.match(sentencePattern);
    if (!sentences || sentences.length === 0) return [cleaned];

    // Capture trailing text after last sentence boundary
    const matchedLength = sentences.reduce((sum, s) => sum + s.length, 0);
    if (matchedLength < cleaned.length) {
        sentences.push(cleaned.slice(matchedLength));
    }

    const chunks: string[] = [];
    let current = '';
    let wordCount = 0;

    for (const sentence of sentences) {
        const sentenceWords = sentence.trim().split(/\s+/).filter(w => w).length;
        if (wordCount > 0 && wordCount + sentenceWords > targetWords) {
            chunks.push(current.trim());
            current = sentence;
            wordCount = sentenceWords;
        } else {
            current += sentence;
            wordCount += sentenceWords;
        }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks.length > 0 ? chunks : [''];
}

/** Short karaoke phrases cut at sentence boundaries, from the TTS word timestamps. */
function buildTimestampChunks(wordTimestamps: WordTimestamp[] | undefined, letterRatio: number): TimestampChunk[] | null {
    if (!wordTimestamps || wordTimestamps.length === 0) return null;

    // Filter out ellipsis tokens that leak from TTS separators
    const filtered = wordTimestamps.filter(w => w.word !== '...' && w.word !== '…');
    if (filtered.length === 0) return null;

    // Determine letter/response boundary from word ratio
    const splitIndex = Math.round(filtered.length * letterRatio);

    const chunks: TimestampChunk[] = [];
    const minWords = 3;         // minimum before allowing a sentence-end break
    const targetWords = 7;      // target chunk size — short punchy karaoke phrases
    const hardCeiling = Math.ceil(targetWords * 1.5); // ~11 — force break regardless
    let chunkStart = 0;

    for (let i = 0; i < filtered.length; i++) {
        const wordCount = i - chunkStart + 1;
        const word = filtered[i].word;
        const isSentenceEnd = /[.!?]/.test(word);
        const isNaturalPause = /[,;—–\-]/.test(word);
        const isLastWord = i === filtered.length - 1;
        // Force a break at the letter/response boundary
        const isLetterEnd = splitIndex > 0 && i === splitIndex - 1;

        const shouldBreak =
            (isSentenceEnd && wordCount >= minWords) ||
            isLetterEnd ||
            (isNaturalPause && wordCount >= targetWords) ||
            (wordCount >= hardCeiling) ||
            isLastWord;

        if (shouldBreak) {
            const group = filtered.slice(chunkStart, i + 1);
            let text = group.map(w => w.word).join(' ');
            // Format sign-off: "Sincerely, Name" → "Sincerely,\nName"
            text = text.replace(/\b(Sincerely,)\s+/i, '$1\n');
            // Format greeting: "Dear Name," → "Dear Name,\n"
            text = text.replace(/^(Dear\s+[^,]+,)\s+/i, '$1\n');
            chunks.push({
                text,
                start: group[0].start,
                end: group[group.length - 1].end,
                words: group.map(w => ({ word: w.word, start: w.start, end: w.end })),
            });
            chunkStart = i + 1;
        }
    }
    return chunks;
}

export interface SubtitleTrack {
    letterChunks: string[];
    responseChunks: string[];
    allChunks: string[];
    timestampChunks: TimestampChunk[] | null;
}

export function buildSubtitleTrack(letter: string, response: string, wordTimestamps: WordTimestamp[] | undefined, letterRatio: number): SubtitleTrack {
    const letterChunks = chunkText(letter);
    const responseChunks = chunkText(response.replace(/^THE COUNSEL:\s*/i, ''));
    return {
        letterChunks,
        responseChunks,
        allChunks: [...letterChunks, ...responseChunks],
        timestampChunks: buildTimestampChunks(wordTimestamps, letterRatio),
    };
}

interface PlaybackPosition {
    audioPhase: AudioPhase;
    isPlaying: boolean;
    audioCurrentTime: number;
    audioProgress: number;
    /** True for a single unified audio file (progress spans letter and response). */
    isUnified: boolean;
    letterRatio: number;
}

/** The subtitle line to show for the current playback position. */
export function getCurrentSubtitle(track: SubtitleTrack, pos: PlaybackPosition): Subtitle | null {
    const { letterChunks, responseChunks, allChunks, timestampChunks } = track;
    const { audioPhase, isPlaying, audioCurrentTime, audioProgress, isUnified, letterRatio } = pos;

    // When not playing, show the first chunk as a readable preview
    if (audioPhase === 'idle' && !isPlaying) {
        if (timestampChunks && timestampChunks.length > 0) {
            // Timestamp chunks already include verdict words (prepended in TTS)
            return { current: timestampChunks[0].text, next: timestampChunks[1]?.text || '', lineIndex: 0, totalLines: timestampChunks.length, words: timestampChunks[0].words, activeWordIndex: -1 };
        }
        if (allChunks.length > 0) {
            return { current: allChunks[0], next: allChunks[1] || '', lineIndex: 0, totalLines: allChunks.length };
        }
        return null;
    }

    // ── Timestamp-based sync (precise) — once a player is active ──
    if (timestampChunks && audioPhase !== 'idle') {
        const currentTime = audioCurrentTime;
        let chunkIndex = 0;
        for (let i = 0; i < timestampChunks.length; i++) {
            if (currentTime >= timestampChunks[i].start) {
                chunkIndex = i;
            } else {
                break;
            }
        }
        const chunk = timestampChunks[chunkIndex];
        const current = chunk?.text || '';
        const next = timestampChunks[chunkIndex + 1]?.text || '';
        // Find active word within chunk for karaoke highlight
        let activeWordIndex = 0;
        if (chunk?.words) {
            for (let w = 0; w < chunk.words.length; w++) {
                if (currentTime >= chunk.words[w].start) {
                    activeWordIndex = w;
                } else {
                    break;
                }
            }
        }
        return { current, next, lineIndex: chunkIndex, totalLines: timestampChunks.length, words: chunk?.words, activeWordIndex };
    }

    // ── Fallback: word-count-weighted estimate (for older posts) ──
    const lines = audioPhase === 'response' ? responseChunks : letterChunks;
    if (lines.length === 0) return null;

    let phaseProgress: number;
    if (isUnified) {
        if (audioPhase === 'letter') {
            phaseProgress = letterRatio > 0
                ? Math.min(audioProgress / letterRatio, 1)
                : 0;
        } else {
            const responseRange = 1 - letterRatio;
            phaseProgress = responseRange > 0
                ? Math.min((audioProgress - letterRatio) / responseRange, 1)
                : 0;
        }
    } else {
        phaseProgress = audioProgress;
    }

    const wordCounts = lines.map(l => l.split(/\s+/).length);
    const totalWords = wordCounts.reduce((a, b) => a + b, 0);
    let cumulative = 0;
    let lineIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        cumulative += wordCounts[i] / totalWords;
        if (phaseProgress < cumulative) {
            lineIndex = i;
            break;
        }
        lineIndex = i;
    }

    const current = lines[lineIndex] || '';
    const next = lines[lineIndex + 1] || '';
    // lineIndex in the context of allChunks
    const globalLineIndex = audioPhase === 'response' ? letterChunks.length + lineIndex : lineIndex;
    return { current, next, lineIndex: globalLineIndex, totalLines: allChunks.length };
}
