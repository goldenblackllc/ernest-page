import sharp from 'sharp';

const WIDTH = 1080;
const HEIGHT = 1920;

let canvasAvailable = false;
let createCanvas: any;
let loadImage: any;

// Try to load @napi-rs/canvas (works locally, not on Vercel)
try {
    const canvas = require('@napi-rs/canvas');
    createCanvas = canvas.createCanvas;
    loadImage = canvas.loadImage;
    canvasAvailable = true;
    console.log('[RenderVerdictCard] Using @napi-rs/canvas renderer');
} catch {
    console.log('[RenderVerdictCard] @napi-rs/canvas not available, using sharp+SVG fallback');
}

/**
 * Renders a verdict card: photo background + verdict text overlay.
 * 
 * Uses @napi-rs/canvas when available (local dev), falls back to
 * sharp with multiple SVG composite passes (Vercel serverless).
 */
export async function renderVerdictCard(
    photoBuffer: Buffer,
    verdict: string,
): Promise<Buffer> {
    if (canvasAvailable) {
        return renderWithCanvas(photoBuffer, verdict);
    }
    return renderWithSharp(photoBuffer, verdict);
}

// ─── Canvas renderer (local dev) ─────────────────────────────────────────────
async function renderWithCanvas(photoBuffer: Buffer, verdict: string): Promise<Buffer> {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    const photo = await loadImage(photoBuffer);
    const scale = Math.max(WIDTH / photo.width, HEIGHT / photo.height);
    const scaledW = photo.width * scale;
    const scaledH = photo.height * scale;
    ctx.drawImage(photo, (WIDTH - scaledW) / 2, (HEIGHT - scaledH) / 2, scaledW, scaledH);

    const { fontSize, maxChars, lineHeight } = getAdaptiveSizing(verdict.length);
    const strokeWidth = Math.max(4, Math.round(fontSize / 8));
    const shadowBlur = Math.round(fontSize / 4);
    const lines = wrapText(verdict, maxChars);
    const totalTextHeight = lines.length * lineHeight;
    const textStartY = (HEIGHT * 0.40) - (totalTextHeight / 2) + (lineHeight / 2);

    const fontSpec = `800 ${fontSize}px "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.font = fontSpec;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Layer 1: Shadow glow
    ctx.save();
    ctx.shadowColor = 'black';
    ctx.shadowBlur = shadowBlur;
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], WIDTH / 2, textStartY + i * lineHeight);
    ctx.restore();

    // Layer 2: Thick stroke
    ctx.save();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    for (let i = 0; i < lines.length; i++) ctx.strokeText(lines[i], WIDTH / 2, textStartY + i * lineHeight);
    ctx.restore();

    // Layer 3: White fill
    ctx.fillStyle = 'white';
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], WIDTH / 2, textStartY + i * lineHeight);

    // Brand mark
    ctx.save();
    ctx.font = '500 26px "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.strokeText('EARNEST PAGE', WIDTH / 2, HEIGHT - 100);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('EARNEST PAGE', WIDTH / 2, HEIGHT - 100);
    ctx.restore();

    return canvas.toBuffer('image/png');
}

// ─── Sharp+SVG renderer (Vercel fallback) ────────────────────────────────────
// Renders text as multiple separate sharp composite passes to avoid
// librsvg's poor stroke/shadow rendering.
async function renderWithSharp(photoBuffer: Buffer, verdict: string): Promise<Buffer> {
    const resizedPhoto = await sharp(photoBuffer)
        .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
        .toBuffer();

    const { fontSize, maxChars, lineHeight } = getAdaptiveSizing(verdict.length);
    const strokeWidth = Math.max(5, Math.round(fontSize / 6));
    const lines = wrapText(verdict, maxChars);
    const totalTextHeight = lines.length * lineHeight;
    const textStartY = (HEIGHT * 0.40) - (totalTextHeight / 2) + (lineHeight / 2);

    const font = `"Helvetica Neue", Helvetica, Arial, sans-serif`;

    // Build a single SVG with layered text for the best quality sharp can deliver:
    // 1) Large blurred black text (shadow)
    // 2) Thick stroked black text (outline)  
    // 3) White filled text (visible letter)
    const textLines = lines.map((line, i) => {
        const y = textStartY + (i * lineHeight);
        const escaped = escapeXml(line);
        const common = `x="${WIDTH / 2}" y="${y}" font-family='${font}' font-size="${fontSize}" font-weight="800" text-anchor="middle" dominant-baseline="middle"`;

        // Shadow: large black text with Gaussian blur
        const shadow = `<text ${common} fill="black" fill-opacity="0.8" filter="url(#shadow)">${escaped}</text>`;
        // Outline: thick black stroke
        const outline = `<text ${common} fill="black" stroke="black" stroke-width="${strokeWidth}" stroke-linejoin="round">${escaped}</text>`;
        // Fill: white on top
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
