import sharp from 'sharp';

interface RenderFrameOptions {
    heroPath: string;
}

/**
 * Renders the video background frame as a 1080×1920 PNG.
 * Only handles: hero image resize + gradient overlays.
 * ALL text is handled by ASS subtitles (sharp can't render custom fonts on Lambda).
 * Avatar is NOT rendered — it's always hidden behind platform UIs
 * (TikTok, Instagram, YouTube Shorts all overlay their own profile picture).
 */
export async function renderFrame(opts: RenderFrameOptions): Promise<Buffer> {
    const WIDTH = 1080;
    const HEIGHT = 1920;

    // Load and resize hero to fill 1080x1920
    const hero = sharp(opts.heroPath).resize(WIDTH, HEIGHT, {
        fit: 'cover',
        position: 'centre',
    });

    // Build SVG overlay with gradients only (no text, no avatar)
    const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="black" stop-opacity="0.85"/>
                <stop offset="100%" stop-color="black" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="botGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="black" stop-opacity="0"/>
                <stop offset="100%" stop-color="black" stop-opacity="0.92"/>
            </linearGradient>
        </defs>

        <!-- Top gradient -->
        <rect x="0" y="0" width="${WIDTH}" height="550" fill="url(#topGrad)"/>
        <!-- Bottom gradient -->
        <rect x="0" y="${HEIGHT - 550}" width="${WIDTH}" height="550" fill="url(#botGrad)"/>
    </svg>`;

    const svgBuffer = Buffer.from(svg);
    const result = await hero
        .composite([{ input: svgBuffer, top: 0, left: 0 }])
        .png()
        .toBuffer();

    return result;
}

/**
 * Word-wrap a line of text for SVG rendering.
 * Breaks at spaces to fit within maxChars per line.
 */
function wrapText(text: string, maxChars: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
        if (current && (current.length + 1 + word.length) > maxChars) {
            lines.push(current);
            current = word;
        } else {
            current = current ? `${current} ${word}` : word;
        }
    }
    if (current) lines.push(current);
    return lines;
}

/** Escape XML special chars for SVG text elements */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Renders a hook frame for social media export: title text on a black background.
 * 1080×1920 PNG, white text in the upper third — center is reserved for subtitles.
 */
export async function renderHookFrame(title: string): Promise<Buffer> {
    const WIDTH = 1080;
    const HEIGHT = 1920;

    const lines = wrapText(title, 18);
    const fontSize = 88;
    const lineHeight = fontSize * 1.3;
    const startY = HEIGHT * 0.18; // upper third — clear of center subtitles

    const textElements = lines.map((line, i) =>
        `<text x="${WIDTH / 2}" y="${startY + i * lineHeight + fontSize}" text-anchor="middle" font-family="HK Grotesk, Inter, sans-serif" font-size="${fontSize}" font-weight="700" fill="white">${escapeXml(line)}</text>`
    ).join('\n        ');

    // Subtle "Earnest Page" branding at bottom
    const brandY = HEIGHT - 120;

    const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${WIDTH}" height="${HEIGHT}" fill="black"/>
        ${textElements}
        <text x="${WIDTH / 2}" y="${brandY}" text-anchor="middle" font-family="HK Grotesk, Inter, sans-serif" font-size="24" font-weight="400" fill="rgba(255,255,255,0.2)">Earnest Page</text>
    </svg>`;

    return sharp({
        create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
    })
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .png()
        .toBuffer();
}

/**
 * Renders a closing frame for social media export: a strong line + branding on black.
 * 1080×1920 PNG, centered text with subdued styling.
 */
export async function renderClosingFrame(closingLine: string): Promise<Buffer> {
    const WIDTH = 1080;
    const HEIGHT = 1920;

    const lines = wrapText(closingLine, 26);
    const fontSize = 56;
    const lineHeight = fontSize * 1.35;
    const totalTextHeight = lines.length * lineHeight;
    const startY = (HEIGHT - totalTextHeight) / 2 - 40;

    const textElements = lines.map((line, i) =>
        `<text x="${WIDTH / 2}" y="${startY + i * lineHeight + fontSize}" text-anchor="middle" font-family="HK Grotesk, Inter, sans-serif" font-size="${fontSize}" font-weight="500" fill="rgba(255,255,255,0.85)">${escapeXml(line)}</text>`
    ).join('\n        ');

    const brandY = HEIGHT - 120;

    const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${WIDTH}" height="${HEIGHT}" fill="black"/>
        ${textElements}
        <text x="${WIDTH / 2}" y="${brandY}" text-anchor="middle" font-family="HK Grotesk, Inter, sans-serif" font-size="28" font-weight="500" fill="rgba(255,255,255,0.3)">Earnest Page</text>
        <text x="${WIDTH / 2}" y="${brandY + 36}" text-anchor="middle" font-family="HK Grotesk, Inter, sans-serif" font-size="18" font-weight="400" fill="rgba(255,255,255,0.15)">Your feelings have something to tell you.</text>
    </svg>`;

    return sharp({
        create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
    })
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .png()
        .toBuffer();
}
