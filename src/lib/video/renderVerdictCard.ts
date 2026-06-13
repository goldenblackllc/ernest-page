import { createCanvas, loadImage } from '@napi-rs/canvas';

const WIDTH = 1080;
const HEIGHT = 1920;

/**
 * Renders a verdict card: photo background + verdict text overlay.
 *
 * Uses a triple-layer text technique for guaranteed readability on any background:
 *   1. Shadow glow via ctx.shadowBlur / ctx.shadowColor (soft dark halo)
 *   2. Thick black stroke outline via ctx.strokeText (crisp edge definition)
 *   3. White fill via ctx.fillText (the visible letter)
 *
 * No gradient overlay is applied — the photo shows through fully.
 */
export async function renderVerdictCard(
    photoBuffer: Buffer,
    verdict: string,
): Promise<Buffer> {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // ── Draw photo background (cover) ────────────────────────────────────────
    const photo = await loadImage(photoBuffer);
    const photoW = photo.width;
    const photoH = photo.height;

    // Compute "cover" crop: scale to fill, then center
    const scale = Math.max(WIDTH / photoW, HEIGHT / photoH);
    const scaledW = photoW * scale;
    const scaledH = photoH * scale;
    const offsetX = (WIDTH - scaledW) / 2;
    const offsetY = (HEIGHT - scaledH) / 2;

    ctx.drawImage(photo, offsetX, offsetY, scaledW, scaledH);

    // ── Compute adaptive text sizing ─────────────────────────────────────────
    const { fontSize, maxChars, lineHeight } = getAdaptiveSizing(verdict.length);
    const strokeWidth = Math.max(4, Math.round(fontSize / 8));
    const shadowBlur = Math.round(fontSize / 4);

    const lines = wrapText(verdict, maxChars);
    const totalTextHeight = lines.length * lineHeight;
    // Center verdict in the upper-middle zone (~40% of height)
    const textStartY = (HEIGHT * 0.40) - (totalTextHeight / 2) + (lineHeight / 2);

    const fontSpec = `800 ${fontSize}px "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif`;
    ctx.font = fontSpec;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '-0.5px';

    // ── Layer 1: Soft dark shadow glow ───────────────────────────────────────
    ctx.save();
    ctx.shadowColor = 'black';
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    for (let i = 0; i < lines.length; i++) {
        const y = textStartY + i * lineHeight;
        ctx.fillText(lines[i], WIDTH / 2, y);
    }
    ctx.restore();

    // ── Layer 2: Thick black stroke outline ──────────────────────────────────
    ctx.save();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    for (let i = 0; i < lines.length; i++) {
        const y = textStartY + i * lineHeight;
        ctx.strokeText(lines[i], WIDTH / 2, y);
    }
    ctx.restore();

    // ── Layer 3: White fill ──────────────────────────────────────────────────
    ctx.fillStyle = 'white';
    for (let i = 0; i < lines.length; i++) {
        const y = textStartY + i * lineHeight;
        ctx.fillText(lines[i], WIDTH / 2, y);
    }

    // ── Brand mark ───────────────────────────────────────────────────────────
    ctx.save();
    ctx.font = '500 26px "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '3px';

    // Paint-order emulation: stroke first, then fill on top
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.strokeText('EARNEST PAGE', WIDTH / 2, HEIGHT - 100);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText('EARNEST PAGE', WIDTH / 2, HEIGHT - 100);
    ctx.restore();

    // ── Export ────────────────────────────────────────────────────────────────
    return canvas.toBuffer('image/png');
}

// ─── Adaptive sizing ─────────────────────────────────────────────────────────
function getAdaptiveSizing(charCount: number): { fontSize: number; maxChars: number; lineHeight: number } {
    if (charCount <= 40) {
        return { fontSize: 108, maxChars: 14, lineHeight: 124 };
    } else if (charCount <= 80) {
        return { fontSize: 84, maxChars: 18, lineHeight: 100 };
    } else if (charCount <= 120) {
        return { fontSize: 72, maxChars: 22, lineHeight: 88 };
    } else if (charCount <= 170) {
        return { fontSize: 64, maxChars: 26, lineHeight: 78 };
    } else if (charCount <= 250) {
        return { fontSize: 56, maxChars: 28, lineHeight: 70 };
    } else {
        return { fontSize: 48, maxChars: 32, lineHeight: 62 };
    }
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
