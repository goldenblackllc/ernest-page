import sharp from 'sharp';

const WIDTH = 1080;
const HEIGHT = 1920;
const FONT_FAMILY = 'HK Grotesk, Inter, sans-serif';

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
 * Renders a branded text-hook card image (1080×1920 PNG).
 *
 * Used when the AI decides the post's title/hook is strong enough to BE
 * the visual — no photography needed. The title dominates the center of the
 * canvas, flanked by thin accent lines, with subtle brand marks at the bottom.
 *
 * Design:
 *  - Deep black background with a soft center radial glow for depth
 *  - Title: 88px, bold, white, vertically centered, 18-char word wrap
 *  - Thin accent lines (2px, very low opacity) above and below the title block
 *  - "Earnest Page" brand mark + tagline anchored near the bottom
 */
export async function renderTextCard(title: string): Promise<Buffer> {
    const lines = wrapText(title, 18);
    const fontSize = 88;
    const lineHeight = fontSize * 1.25; // tighter leading for display type
    const totalTextHeight = lines.length * lineHeight;

    // Vertical center of canvas
    const textBlockTop = (HEIGHT - totalTextHeight) / 2;

    // --- Title text elements ---
    const textElements = lines
        .map((line, i) => {
            const y = textBlockTop + i * lineHeight + fontSize;
            return `<text x="${WIDTH / 2}" y="${y}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="${fontSize}" font-weight="700" fill="white">${escapeXml(line)}</text>`;
        })
        .join('\n        ');

    // --- Accent lines ---
    const accentLineWidth = Math.round(WIDTH * 0.4);
    const accentX = (WIDTH - accentLineWidth) / 2;
    const accentPadding = 60;

    const topAccentY = textBlockTop - accentPadding;
    const bottomAccentY = textBlockTop + totalTextHeight + accentPadding;

    const accentColor = 'rgba(255,255,255,0.08)';

    // --- Brand elements ---
    const brandY = HEIGHT - 120;
    const taglineY = HEIGHT - 84;

    const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="centerGlow" cx="50%" cy="50%" r="60%" fx="50%" fy="50%">
                <stop offset="0%" stop-color="white" stop-opacity="0.03"/>
                <stop offset="100%" stop-color="white" stop-opacity="0"/>
            </radialGradient>
        </defs>

        <!-- Deep black base -->
        <rect width="${WIDTH}" height="${HEIGHT}" fill="#0a0a0a"/>

        <!-- Subtle radial glow for depth -->
        <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#centerGlow)"/>

        <!-- Top accent line -->
        <rect x="${accentX}" y="${topAccentY}" width="${accentLineWidth}" height="2" fill="${accentColor}" rx="1"/>

        <!-- Title text -->
        ${textElements}

        <!-- Bottom accent line -->
        <rect x="${accentX}" y="${bottomAccentY}" width="${accentLineWidth}" height="2" fill="${accentColor}" rx="1"/>

        <!-- Brand mark -->
        <text x="${WIDTH / 2}" y="${brandY}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="24" font-weight="400" fill="rgba(255,255,255,0.15)">Earnest Page</text>

        <!-- Tagline -->
        <text x="${WIDTH / 2}" y="${taglineY}" text-anchor="middle" font-family="${FONT_FAMILY}" font-size="16" font-weight="300" fill="rgba(255,255,255,0.08)">Your feelings have something to tell you.</text>
    </svg>`;

    return sharp({
        create: {
            width: WIDTH,
            height: HEIGHT,
            channels: 4,
            background: { r: 10, g: 10, b: 10, alpha: 1 },
        },
    })
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .png()
        .toBuffer();
}
