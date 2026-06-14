import sharp from 'sharp';

const WIDTH = 1080;
const HEIGHT = 1920;

/**
 * Renders a verdict card: photo background + verdict text overlay.
 *
 * Uses sharp with a triple-layer SVG composite for text readability:
 *   1. Blurred black shadow (soft dark halo behind text)
 *   2. Thick black stroke outline (crisp edge definition)
 *   3. White fill on top (the visible letter)
 *
 * No gradient overlay — the photo shows through fully.
 */
export async function renderVerdictCard(
    photoBuffer: Buffer,
    verdict: string,
): Promise<Buffer> {
    const resizedPhoto = await sharp(photoBuffer)
        .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
        .toBuffer();

    const { fontSize, maxChars, lineHeight } = getAdaptiveSizing(verdict.length);
    const strokeWidth = Math.max(5, Math.round(fontSize / 6));
    const lines = wrapText(verdict, maxChars);
    const totalTextHeight = lines.length * lineHeight;
    const textStartY = (HEIGHT * 0.40) - (totalTextHeight / 2) + (lineHeight / 2);

    const font = `"Helvetica Neue", Helvetica, Arial, sans-serif`;

    // Build text lines with three layers each: shadow, outline, fill
    const textLines = lines.map((line, i) => {
        const y = textStartY + (i * lineHeight);
        const escaped = escapeXml(line);
        const common = `x="${WIDTH / 2}" y="${y}" font-family='${font}' font-size="${fontSize}" font-weight="800" text-anchor="middle" dominant-baseline="middle"`;

        const shadow = `<text ${common} fill="black" fill-opacity="0.8" filter="url(#shadow)">${escaped}</text>`;
        const outline = `<text ${common} fill="black" stroke="black" stroke-width="${strokeWidth}" stroke-linejoin="round">${escaped}</text>`;
        const fill = `<text ${common} fill="white">${escaped}</text>`;

        return shadow + '\n' + outline + '\n' + fill;
    }).join('\n');

    // Brand mark
    const brandY = HEIGHT - 100;
    const brand = `<text x="${WIDTH / 2}" y="${brandY}" font-family='${font}' font-size="26" font-weight="500" fill="white" fill-opacity="0.5" stroke="black" stroke-width="2" stroke-linejoin="round" paint-order="stroke fill" text-anchor="middle" letter-spacing="3">EARNEST PAGE</text>`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
        <defs>
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="${Math.round(fontSize / 5)}"/>
            </filter>
        </defs>
        ${textLines}
        ${brand}
    </svg>`;

    return await sharp(resizedPhoto)
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .png()
        .toBuffer();
}

// ─── Adaptive sizing ─────────────────────────────────────────────────────────
function getAdaptiveSizing(charCount: number): { fontSize: number; maxChars: number; lineHeight: number } {
    if (charCount <= 40) return { fontSize: 108, maxChars: 14, lineHeight: 124 };
    if (charCount <= 80) return { fontSize: 84, maxChars: 18, lineHeight: 100 };
    if (charCount <= 120) return { fontSize: 72, maxChars: 22, lineHeight: 88 };
    if (charCount <= 170) return { fontSize: 64, maxChars: 26, lineHeight: 78 };
    if (charCount <= 250) return { fontSize: 56, maxChars: 28, lineHeight: 70 };
    return { fontSize: 48, maxChars: 32, lineHeight: 62 };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function wrapText(text: string, maxCharsPerLine: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
        if (currentLine.length + word.length + 1 > maxCharsPerLine && currentLine.length > 0) {
            lines.push(currentLine.trim());
            currentLine = word;
        } else {
            currentLine += (currentLine ? ' ' : '') + word;
        }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    return lines;
}

function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
